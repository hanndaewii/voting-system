-- ════════════════════════════════════════════════════════════════
-- CWPC Step 5: ranking logic + locked-contest freeze (safe to re-run)
-- Final score per contestant:
--   1. per judge:  sum(value * weight) / sum(weight)   (final scores only)
--   2. across judges: simple average, or trimmed average (drop the single
--      highest and lowest) when use_trimmed_average AND >= 3 judges counted
-- A judge counts for a contestant only with a FINAL score for EVERY
-- criterion, and only if active + non-admin. Draft/inactive/admin scores
-- never count.
-- Tie-break: final_score (rounded to 2dp — displayed ties are ties),
-- then top_criterion_avg (best single-criterion average across judges),
-- then name. Ranked with rank() in that deterministic order.
-- get_results() is SECURITY DEFINER (it reads across judges, which no
-- caller may do directly) with manual access checks: contest admin, or
-- active judge of a LOCKED contest. It returns no per-judge data.
-- ════════════════════════════════════════════════════════════════

-- ── Trimmed-average toggle ──────────────────────────────────────
alter table public.contests
  add column if not exists use_trimmed_average boolean not null default false;

-- ── Results function ────────────────────────────────────────────
create or replace function public.get_results(p_contest_id uuid)
returns table (
  rank              bigint,
  contestant_id     uuid,
  number            integer,
  name              text,
  photo_url         text,
  final_score       numeric,
  judges_counted    integer,
  top_criterion_avg numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid;
  v_is_admin boolean;
  v_status   public.contest_status;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return;  -- anon: no rows
  end if;

  select exists (
    select 1 from public.judges j
    where j.user_id = v_uid
      and j.contest_id = p_contest_id
      and j.is_admin
      and j.is_active
  ) into v_is_admin;

  if not v_is_admin then
    select c.status into v_status
    from public.contests c
    where c.id = p_contest_id;

    if v_status is distinct from 'locked' then
      return;  -- judges see nothing before lock
    end if;

    perform 1 from public.judges j
    where j.user_id = v_uid
      and j.contest_id = p_contest_id
      and j.is_active
      and not j.is_admin;
    if not found then
      return;  -- not a judge of this contest: no rows
    end if;
  end if;

  return query
  with crit as (
    select c.id, c.weight
    from public.criteria c
    where c.contest_id = p_contest_id
  ),
  judge_scores as (
    -- One weighted average per (contestant, judge); only judges with a
    -- FINAL score for EVERY criterion count (HAVING = criteria count).
    select s.contestant_id,
           s.judge_id,
           sum(s.value * c.weight) / nullif(sum(c.weight), 0) as wavg
    from public.scores s
    join public.judges j on j.id = s.judge_id
    join crit c on c.id = s.criterion_id
    where s.contest_id = p_contest_id
      and s.is_final
      and j.contest_id = p_contest_id
      and j.is_active
      and not j.is_admin
    group by s.contestant_id, s.judge_id
    having count(*) = (select count(*) from crit)
  ),
  arr as (
    select js.contestant_id,
           array_agg(js.wavg order by js.wavg) as scores,
           count(*)::integer as n
    from judge_scores js
    group by js.contestant_id
  ),
  use_trim as (
    select co.use_trimmed_average as flag
    from public.contests co
    where co.id = p_contest_id
  ),
  final as (
    select a.contestant_id,
           round(case
             when (select flag from use_trim) and a.n >= 3
               then (select avg(v) from unnest(a.scores[2:array_length(a.scores, 1) - 1]) as v)
             else (select avg(v) from unnest(a.scores) as v)
           end, 2) as final_score,
           a.n as judges_counted
    from arr a
  ),
  crit_avg as (
    -- Per-criterion average across COUNTED judges only.
    select s.contestant_id, s.criterion_id, avg(s.value) as cavg
    from public.scores s
    where s.contest_id = p_contest_id
      and s.is_final
      and (s.contestant_id, s.judge_id) in (
        select js2.contestant_id, js2.judge_id from judge_scores js2
      )
    group by s.contestant_id, s.criterion_id
  ),
  topcrit as (
    select ca.contestant_id, max(ca.cavg) as top_criterion_avg
    from crit_avg ca
    group by ca.contestant_id
  )
  select rank() over (
           order by f.final_score desc nulls last,
                    t.top_criterion_avg desc nulls last,
                    ct.name
         ),
         ct.id,
         ct.number,
         ct.name,
         ct.photo_url,
         f.final_score,
         coalesce(f.judges_counted, 0),
         t.top_criterion_avg
  from public.contestants ct
  left join final f on f.contestant_id = ct.id
  left join topcrit t on t.contestant_id = ct.id
  where ct.contest_id = p_contest_id
  order by 1, ct.name;
end;
$$;

-- Execute: authenticated only (revoking from public covers anon too).
-- Unauthorized callers simply get zero rows (checked inside).
revoke all on function public.get_results(uuid) from public, anon;
grant execute on function public.get_results(uuid) to authenticated;

-- ── Locked-contest freeze ───────────────────────────────────────
-- Extends the prevent_unlock approach: once locked, the trimmed-average
-- setting, criteria and contestants are immutable. Deleting a whole
-- locked contest is therefore superuser-only maintenance (disable the
-- two child triggers first) — locked data cannot be destroyed by accident.
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
    raise exception '% in a locked contest cannot be modified', TG_TABLE_NAME;
  end if;

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

drop trigger if exists contests_freeze_settings on public.contests;
create trigger contests_freeze_settings
  before update on public.contests
  for each row
  execute function public.freeze_locked_contest();

drop trigger if exists criteria_freeze_locked on public.criteria;
create trigger criteria_freeze_locked
  before insert or update or delete on public.criteria
  for each row
  execute function public.freeze_locked_contest();

drop trigger if exists contestants_freeze_locked on public.contestants;
create trigger contestants_freeze_locked
  before insert or update or delete on public.contestants
  for each row
  execute function public.freeze_locked_contest();

-- harden: no client may call the trigger function directly
-- (trigger firing itself needs no EXECUTE privilege)
revoke execute on function public.freeze_locked_contest() from public, anon, authenticated;
