-- ════════════════════════════════════════════════════════════════
-- CWPC Step 6: admin functions + judges freeze + realtime (re-runnable)
-- 1. freeze_locked_contest() extended to the judges table: in a locked
--    contest, non-admin judge rows cannot be updated or deleted, no new
--    scorer rows can be inserted, and is_admin cannot flip either way
--    (that would add/remove scores from frozen results). Admin rows that
--    stay admins remain manageable.
-- 2. Admin-only functions (SECURITY DEFINER, manual admin check inside):
--      outstanding_score_threshold() — the single changeable constant
--      admin_summary(p_contest_id)       — contest-wide cards
--      admin_judge_progress(p_contest_id)— per-judge progress rows
--    Scope everywhere: ACTIVE, NON-ADMIN judges; drafts count as activity
--    (they are real scoring work), finals decide submission. Judges and
--    anon get 42501 (raise), never data.
-- 3. Realtime publication for scores + contests (idempotent).
-- ════════════════════════════════════════════════════════════════

-- ── Judges freeze (extends the Step-5 freeze) ───────────────────
create or replace function public.freeze_locked_contest()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_locked boolean;
begin
  if TG_TABLE_NAME = 'contests' then
    -- Only installed as BEFORE UPDATE.
    if old.status = 'locked'
       and new.use_trimmed_average is distinct from old.use_trimmed_average then
      raise exception 'locked contest settings cannot be changed';
    end if;
    return new;
  end if;

  if TG_TABLE_NAME = 'judges' then
    if TG_OP = 'DELETE' then
      select (c.status = 'locked') into v_locked
      from public.contests c where c.id = old.contest_id;
    elsif TG_OP = 'INSERT' then
      select (c.status = 'locked') into v_locked
      from public.contests c where c.id = new.contest_id;
    else -- UPDATE: a move touching a locked contest on either side is frozen
      select exists (
        select 1 from public.contests c
        where c.id in (old.contest_id, new.contest_id)
          and c.status = 'locked'
      ) into v_locked;
    end if;

    if coalesce(v_locked, false) then
      if TG_OP = 'INSERT' then
        if coalesce(new.is_admin, false) then
          return new;  -- adding admins never changes results
        end if;
        raise exception 'judge rows cannot be added to a locked contest';
      elsif TG_OP = 'DELETE' then
        if coalesce(old.is_admin, false) then
          return old;  -- removing admins never changes results
        end if;
        raise exception 'judges in a locked contest cannot be removed';
      else -- UPDATE
        if coalesce(old.is_admin, false) and coalesce(new.is_admin, false) then
          return new;  -- admin rows staying admin remain manageable
        end if;
        raise exception 'judges in a locked contest cannot be modified';
      end if;
    end if;

    if TG_OP = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;

  -- criteria + contestants: any write touching a locked contest is frozen
  if TG_OP = 'DELETE' then
    select (c.status = 'locked') into v_locked
    from public.contests c where c.id = old.contest_id;
  elsif TG_OP = 'INSERT' then
    select (c.status = 'locked') into v_locked
    from public.contests c where c.id = new.contest_id;
  else
    select exists (
      select 1 from public.contests c
      where c.id in (old.contest_id, new.contest_id)
        and c.status = 'locked'
    ) into v_locked;
  end if;

  if coalesce(v_locked, false) then
    raise exception '% in a locked contest cannot be modified', TG_TABLE_NAME;
  end if;

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

drop trigger if exists judges_freeze_locked on public.judges;
create trigger judges_freeze_locked
  before insert or update or delete on public.judges
  for each row
  execute function public.freeze_locked_contest();

-- privileges persist across CREATE OR REPLACE; restated for clarity
revoke execute on function public.freeze_locked_contest() from public, anon, authenticated;

-- ── Outstanding-score threshold (the single changeable constant) ─
create or replace function public.outstanding_score_threshold()
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 9.0::numeric;
$$;

-- ── Admin summary cards ─────────────────────────────────────────
create or replace function public.admin_summary(p_contest_id uuid)
returns table (
  total_contestants  integer,
  total_scores       integer,
  average_score      numeric,
  outstanding_scores integer,
  judges_total       integer,
  judges_submitted   integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'admins only' using errcode = '42501';
  end if;

  perform 1 from public.judges j
  where j.user_id = v_uid
    and j.contest_id = p_contest_id
    and j.is_admin
    and j.is_active;
  if not found then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return query
  with scope as (
    -- Every score row from active, non-admin judges (drafts included:
    -- they are real scoring activity; submission is tracked separately).
    select s.value
    from public.scores s
    join public.judges j on j.id = s.judge_id
    where s.contest_id = p_contest_id
      and j.contest_id = p_contest_id
      and j.is_active
      and not j.is_admin
  ),
  cells as (
    select (select count(*) from public.contestants where contest_id = p_contest_id)
         * (select count(*) from public.criteria where contest_id = p_contest_id) as expected
  ),
  per_judge as (
    select s.judge_id,
           count(*) as n,
           bool_and(s.is_final) as all_final
    from public.scores s
    join public.judges j on j.id = s.judge_id
    where s.contest_id = p_contest_id
      and j.contest_id = p_contest_id
      and j.is_active
      and not j.is_admin
    group by s.judge_id
  )
  select (select count(*)::integer from public.contestants where contest_id = p_contest_id),
         (select count(*)::integer from scope),
         round((select avg(value) from scope), 2),
         (select count(*)::integer from scope where value >= public.outstanding_score_threshold()),
         (select count(*)::integer from public.judges
           where contest_id = p_contest_id and is_active and not is_admin),
         (select count(*)::integer from per_judge p cross join cells c
           where p.n = c.expected and c.expected > 0 and p.all_final);
end;
$$;

revoke all on function public.admin_summary(uuid) from public, anon;
grant execute on function public.admin_summary(uuid) to authenticated;

-- ── Per-judge progress rows ─────────────────────────────────────
create or replace function public.admin_judge_progress(p_contest_id uuid)
returns table (
  judge_id            uuid,
  name                text,
  is_active           boolean,
  contestants_scored  integer,
  total_contestants   integer,
  has_submitted       boolean,
  average_score_given numeric,
  outstanding_count   integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'admins only' using errcode = '42501';
  end if;

  perform 1 from public.judges j
  where j.user_id = v_uid
    and j.contest_id = p_contest_id
    and j.is_admin
    and j.is_active;
  if not found then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return query
  with cells as (
    select (select count(*) from public.contestants where contest_id = p_contest_id)
         * (select count(*) from public.criteria where contest_id = p_contest_id) as expected
  )
  select j.id,
         j.name,
         j.is_active,
         -- contestants where this judge scored EVERY criterion (draft or final)
         (select count(*)::integer
          from public.contestants ct
          where ct.contest_id = p_contest_id
            and not exists (
              select 1 from public.criteria cr
              where cr.contest_id = p_contest_id
                and not exists (
                  select 1 from public.scores s
                  where s.contestant_id = ct.id
                    and s.criterion_id = cr.id
                    and s.judge_id = j.id
                )
            )),
         (select count(*)::integer from public.contestants where contest_id = p_contest_id),
         -- submitted: full sheet, every row final (and something to submit)
         ((select count(*) from public.scores s
            where s.judge_id = j.id and s.contest_id = p_contest_id) = (select expected from cells)
          and (select expected from cells) > 0
          and not exists (
            select 1 from public.scores s
            where s.judge_id = j.id and s.contest_id = p_contest_id and not s.is_final)),
         (select round(avg(s.value), 2) from public.scores s
           where s.judge_id = j.id and s.contest_id = p_contest_id),
         (select count(*)::integer from public.scores s
           where s.judge_id = j.id and s.contest_id = p_contest_id
             and s.value >= public.outstanding_score_threshold())
  from public.judges j
  where j.contest_id = p_contest_id
    and not j.is_admin
  order by j.name;
end;
$$;

revoke all on function public.admin_judge_progress(uuid) from public, anon;
grant execute on function public.admin_judge_progress(uuid) to authenticated;

-- ── Realtime publication (idempotent) ────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scores'
  ) then
    alter publication supabase_realtime add table public.scores;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contests'
  ) then
    alter publication supabase_realtime add table public.contests;
  end if;
end;
$$;
