-- ════════════════════════════════════════════════════════════════
-- CWPC — Step 2: Row Level Security policies (safe to re-run)
-- Model:
--   * judges (active, non-admin): read own contest data + own scores;
--     all scores visible once the contest is 'locked'; write own scores
--     only while contest is 'open' and the score is not final.
--   * admins (active judges.is_admin): read everything; manage contests,
--     contestants, judges, criteria. No score writes (admins don't score).
--   * score_history: admin read-only; written only by the audit trigger.
--   * anon: nothing (helpers are revoked from anon, so anon queries on
--     protected tables fail closed with 42501 instead of leaking rows).
-- ════════════════════════════════════════════════════════════════

-- ── Helper functions (SECURITY DEFINER avoids RLS recursion) ────
-- All membership checks run as the function owner (postgres, bypasses
-- RLS), so policies on `judges` never query `judges` under RLS.

-- Active admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.judges j
    where j.user_id = auth.uid()
      and j.is_admin
      and j.is_active
  );
$$;

-- Caller's (non-admin, active) judge id for a contest, or null.
-- Null for admins on purpose: admins are not scorers.
create or replace function public.my_judge_id(p_contest uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select j.id from public.judges j
  where j.user_id = auth.uid()
    and j.contest_id = p_contest
    and j.is_active
    and not j.is_admin
  limit 1;
$$;

-- Contest status without tripping over contests RLS.
create or replace function public.contest_status_of(p_contest uuid)
returns public.contest_status
language sql
stable
security definer
set search_path = ''
as $$
  select c.status from public.contests c where c.id = p_contest;
$$;

-- Execute: authenticated only (revoking from public covers anon too).
revoke all on function public.is_admin() from public, anon;
revoke all on function public.my_judge_id(uuid) from public, anon;
revoke all on function public.contest_status_of(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_judge_id(uuid) to authenticated;
grant execute on function public.contest_status_of(uuid) to authenticated;

-- ── contests ────────────────────────────────────────────────────
-- Admins manage contests, but DELETE is restricted: only a scoreless
-- draft may go (open/locked rows are never deletable API-side).
drop policy if exists contests_admin_all on public.contests;
drop policy if exists contests_admin_select on public.contests;
create policy contests_admin_select on public.contests
  for select using (public.is_admin());

drop policy if exists contests_admin_insert on public.contests;
create policy contests_admin_insert on public.contests
  for insert with check (public.is_admin());

drop policy if exists contests_admin_update on public.contests;
create policy contests_admin_update on public.contests
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists contests_admin_delete on public.contests;
create policy contests_admin_delete on public.contests
  for delete using (
    public.is_admin()
    and status = 'draft'
    and not exists (select 1 from public.scores where contest_id = contests.id)
  );

drop policy if exists contests_judge_read on public.contests;
create policy contests_judge_read on public.contests
  for select using (public.my_judge_id(id) is not null);

-- ── contestants ─────────────────────────────────────────────────
drop policy if exists contestants_admin_all on public.contestants;
create policy contestants_admin_all on public.contestants
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists contestants_judge_read on public.contestants;
create policy contestants_judge_read on public.contestants
  for select using (public.my_judge_id(contest_id) is not null);

-- ── criteria ────────────────────────────────────────────────────
drop policy if exists criteria_admin_all on public.criteria;
create policy criteria_admin_all on public.criteria
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists criteria_judge_read on public.criteria;
create policy criteria_judge_read on public.criteria
  for select using (public.my_judge_id(contest_id) is not null);

-- ── judges ──────────────────────────────────────────────────────
drop policy if exists judges_admin_all on public.judges;
create policy judges_admin_all on public.judges
  for all using (public.is_admin()) with check (public.is_admin());

-- A judge sees only their own row, and only while active.
-- (Direct column check — no self-query, so no recursion.)
drop policy if exists judges_self_read on public.judges;
create policy judges_self_read on public.judges
  for select using (user_id = auth.uid() and is_active);

-- ── scores ──────────────────────────────────────────────────────
-- Admins read everything but cannot write (no insert/update/delete
-- policy passes for them: my_judge_id() is null for admin rows).
drop policy if exists scores_admin_read on public.scores;
create policy scores_admin_read on public.scores
  for select using (public.is_admin());

-- Own scores always; every score in the contest once it is locked.
drop policy if exists scores_judge_read on public.scores;
create policy scores_judge_read on public.scores
  for select using (
    judge_id = public.my_judge_id(contest_id)
    or (
      public.contest_status_of(contest_id) = 'locked'
      and public.my_judge_id(contest_id) is not null
    )
  );

-- Insert own scores only: open contest, not final.
drop policy if exists scores_judge_insert on public.scores;
create policy scores_judge_insert on public.scores
  for insert with check (
    judge_id = public.my_judge_id(contest_id)
    and public.contest_status_of(contest_id) = 'open'
    and is_final = false
  );

-- Update own scores only: open contest, not final (old row).
-- The new row may set is_final = true (submitting); afterwards the
-- old-row check blocks any further edit.
drop policy if exists scores_judge_update on public.scores;
create policy scores_judge_update on public.scores
  for update
  using (
    judge_id = public.my_judge_id(contest_id)
    and public.contest_status_of(contest_id) = 'open'
    and is_final = false
  )
  with check (
    judge_id = public.my_judge_id(contest_id)
    and public.contest_status_of(contest_id) = 'open'
  );

-- No DELETE policy on scores for any client role.

-- ── score_history ───────────────────────────────────────────────
-- Admin read-only. Writes happen only via the audit trigger, which runs
-- as the table owner and bypasses RLS — clients cannot forge history.
drop policy if exists score_history_admin_read on public.score_history;
create policy score_history_admin_read on public.score_history
  for select using (public.is_admin());
