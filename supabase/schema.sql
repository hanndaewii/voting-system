-- ════════════════════════════════════════════════════════════════
-- CWPC — Step 1: Database schema
-- Run ONCE on a fresh project via the Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════

-- ── Enum: contest lifecycle ─────────────────────────────────────
create type public.contest_status as enum ('draft', 'open', 'locked');

-- ── contests ────────────────────────────────────────────────────
create table public.contests (
  id          uuid           primary key default gen_random_uuid(),
  name        text           not null,
  status      public.contest_status not null default 'draft',
  created_at  timestamptz    not null default now()
);

-- ── contestants ──────────────────────────────────────────────────
create table public.contestants (
  id          uuid         primary key default gen_random_uuid(),
  contest_id  uuid         not null references public.contests (id) on delete cascade,
  name        text         not null,
  photo_url   text,
  number      integer      not null,
  created_at  timestamptz  not null default now(),

  -- contestant number unique within its contest
  -- (also serves as the contest-scoped index)
  constraint contestants_number_unique    unique (contest_id, number),

  -- FK target for scores (guarantees contest consistency)
  constraint contestants_id_contest_uq    unique (id, contest_id)
);

-- ── judges ──────────────────────────────────────────────────────
create table public.judges (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid         not null references auth.users (id) on delete cascade,
  contest_id  uuid         not null references public.contests (id) on delete cascade,
  name        text         not null,
  is_admin    boolean      not null default false,
  created_at  timestamptz  not null default now(),

  -- a user can only be a judge once per contest
  -- (index leads with user_id → used by RLS lookups)
  constraint judges_user_contest_unique   unique (user_id, contest_id),

  -- FK target for scores
  constraint judges_id_contest_uq         unique (id, contest_id)
);

create index judges_contest_id_idx on public.judges (contest_id);

-- ── criteria ────────────────────────────────────────────────────
create table public.criteria (
  id          uuid           primary key default gen_random_uuid(),
  contest_id  uuid           not null references public.contests (id) on delete cascade,
  name        text           not null,
  weight      numeric(5,2)   not null default 1.00 check (weight > 0),
  created_at  timestamptz    not null default now(),

  -- criteria names unique within a contest
  -- (also serves as the contest-scoped index)
  constraint criteria_name_unique         unique (contest_id, name),

  -- FK target for scores
  constraint criteria_id_contest_uq       unique (id, contest_id)
);

-- ── scores ──────────────────────────────────────────────────────
create table public.scores (
  id             uuid         primary key default gen_random_uuid(),
  contest_id     uuid         not null references public.contests (id) on delete cascade,
  contestant_id  uuid         not null,
  judge_id       uuid         not null,
  criterion_id   uuid         not null,
  value          integer      not null check (value between 1 and 10),
  is_final       boolean      not null default false,
  submitted_at   timestamptz,                      -- set when the judge submits
  created_at     timestamptz  not null default now(),

  -- one score per (contestant, judge, criterion); doubles as an index
  constraint scores_unique_per_key  unique (contestant_id, judge_id, criterion_id),

  -- composite FKs: the score's contest_id must match the contestant's,
  -- judge's and criterion's contest → cross-contest corruption impossible
  constraint scores_contestant_fk foreign key (contestant_id, contest_id)
    references public.contestants (id, contest_id) on delete cascade,
  constraint scores_judge_fk foreign key (judge_id, contest_id)
    references public.judges (id, contest_id) on delete cascade,
  constraint scores_criterion_fk foreign key (criterion_id, contest_id)
    references public.criteria (id, contest_id) on delete cascade
);

-- query / join / cascade support
create index scores_contest_contestant_idx on public.scores (contest_id, contestant_id);
create index scores_judge_contest_idx      on public.scores (judge_id, contest_id);
create index scores_criterion_id_idx        on public.scores (criterion_id);

-- ── score_history (append-only audit log) ──────────────────────
-- No FK to scores on purpose: history must survive score deletion.
create table public.score_history (
  id             bigint       generated always as identity primary key,
  score_id       uuid         not null,
  contest_id     uuid         not null,
  contestant_id  uuid         not null,
  judge_id       uuid         not null,
  criterion_id   uuid         not null,
  old_value      integer      not null,
  new_value      integer,                     -- null = the row was deleted
  operation      text         not null check (operation in ('UPDATE', 'DELETE')),
  changed_by     uuid         references auth.users (id) on delete set null,
  changed_at     timestamptz  not null default now()
);

create index score_history_score_id_idx   on public.score_history (score_id);
create index score_history_contest_time_idx on public.score_history (contest_id, changed_at);

-- ── trigger: auto-write history on every UPDATE / DELETE ────────
-- SECURITY DEFINER is required: it lets the trigger insert into
-- score_history even though no client role has write access there
-- (so the audit trail cannot be forged from the API).
create or replace function public.record_score_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    insert into public.score_history
      (score_id, contest_id, contestant_id, judge_id, criterion_id,
       old_value, new_value, operation, changed_by)
    values
      (old.id, old.contest_id, old.contestant_id, old.judge_id, old.criterion_id,
       old.value, new.value, 'UPDATE', auth.uid());
  else -- DELETE
    insert into public.score_history
      (score_id, contest_id, contestant_id, judge_id, criterion_id,
       old_value, new_value, operation, changed_by)
    values
      (old.id, old.contest_id, old.contestant_id, old.judge_id, old.criterion_id,
       old.value, null, 'DELETE', auth.uid());
  end if;

  return null;  -- AFTER trigger: return value is ignored
end;
$$;

-- harden: no client may call the audit function directly
revoke execute on function public.record_score_change() from public, anon, authenticated;

create trigger scores_audit
  after update or delete
  on public.scores
  for each row
  execute function public.record_score_change();

-- ── RLS: enable everywhere, deny by default ─────────────────────
-- No policies yet → anon + authenticated get zero rows.
-- The SQL Editor and service_role key bypass RLS, so you can still
-- manage data directly. Policies come in the next step.
alter table public.contests      enable row level security;
alter table public.contestants   enable row level security;
alter table public.judges        enable row level security;
alter table public.criteria      enable row level security;
alter table public.scores        enable row level security;
alter table public.score_history enable row level security;

-- ── STEP 1 PATCHES (appended 2026-10-15; safe to re-run) ─────────
-- 1) judges.is_active flag (default true)
-- 2) decimal scores: scores.value + history old/new_value → numeric(3,1)
-- 3) deleting a judge that has scores is blocked (was cascade)
-- 4) audit trigger ignores no-op updates (value unchanged)
alter table public.scores drop constraint if exists scores_judge_fk;
alter table public.scores add constraint scores_judge_fk
  foreign key (judge_id, contest_id)
  references public.judges (id, contest_id) on delete no action;

alter table public.judges add column if not exists is_active boolean not null default true;

alter table public.scores drop constraint if exists scores_value_check;
alter table public.scores alter column value type numeric(3,1);
alter table public.scores add constraint scores_value_check
  check (value between 1 and 10);

alter table public.score_history alter column old_value type numeric(3,1);
alter table public.score_history alter column new_value type numeric(3,1);

create or replace function public.record_score_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.value = new.value then
      return null;
    end if;
    insert into public.score_history
      (score_id, contest_id, contestant_id, judge_id, criterion_id,
       old_value, new_value, operation, changed_by)
    values
      (old.id, old.contest_id, old.contestant_id, old.judge_id, old.criterion_id,
       old.value, new.value, 'UPDATE', auth.uid());
  else
    insert into public.score_history
      (score_id, contest_id, contestant_id, judge_id, criterion_id,
       old_value, new_value, operation, changed_by)
    values
      (old.id, old.contest_id, old.contestant_id, old.judge_id, old.criterion_id,
       old.value, null, 'DELETE', auth.uid());
  end if;
  return null;
end;
$$;

-- ── STEP 1 HARDENING (appended 2026-10-15; safe to re-run) ──────
-- 5) a locked contest can never be reopened (locking is final)
-- 6) scores.submitted_at is auto-stamped when a score becomes final
create or replace function public.prevent_unlock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'locked' and new.status <> 'locked' then
    raise exception 'contest % is locked and cannot be reopened', old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists contests_no_unlock on public.contests;
create trigger contests_no_unlock
  before update on public.contests
  for each row
  execute function public.prevent_unlock();

-- harden: no client may call the trigger functions directly
-- (trigger firing itself needs no EXECUTE privilege)
revoke execute on function public.prevent_unlock() from public, anon, authenticated;

create or replace function public.stamp_submitted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_final and new.submitted_at is null then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists scores_stamp_submitted on public.scores;
create trigger scores_stamp_submitted
  before insert or update on public.scores
  for each row
  execute function public.stamp_submitted_at();

revoke execute on function public.stamp_submitted_at() from public, anon, authenticated;

-- ── Teardown (uncomment ONLY to wipe Step 1 and start over) ─────
-- drop trigger  scores_audit on public.scores;
-- drop function public.record_score_change;
-- drop table   public.score_history;
-- drop table   public.scores;
-- drop table   public.criteria;
-- drop table   public.judges;
-- drop table   public.contestants;
-- drop table   public.contests;
-- drop type    public.contest_status;
