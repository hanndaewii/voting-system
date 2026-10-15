-- ════════════════════════════════════════════════════════════════
-- CWPC Step 4 verification — proves the atomic submit function.
-- Run via the step-4 DB runner: it substitutes real auth user UUIDs for
-- __JUDGE1__ / __JUDGE2__ / __ADMIN__ / __INACTIVE__, then deletes them.
-- Manual run: create 4 auth users, substitute the placeholders, and run
-- the whole script (setup commits; each BEGIN…ROLLBACK block is atomic).
-- ════════════════════════════════════════════════════════════════

-- @@NEXT@@
-- ── SETUP (superuser, bypasses RLS) ─────────────────────────────
-- Prologue: clear leftovers from an interrupted run (no-op when clean).
-- Freeze triggers (Step 5) block child-row deletes on locked contests, so
-- maintenance runs with them disabled, then re-enables. Explicit
-- scores → judges order avoids the scores_judge_fk NO ACTION trap.
alter table public.contestants disable trigger contestants_freeze_locked;
alter table public.criteria disable trigger criteria_freeze_locked;
alter table public.judges disable trigger judges_freeze_locked;
delete from public.scores where contest_id = '55555555-5555-4555-8555-555555555555';
delete from public.judges where contest_id = '55555555-5555-4555-8555-555555555555';
delete from public.contests where id = '55555555-5555-4555-8555-555555555555';
delete from public.score_history where contest_id = '55555555-5555-4555-8555-555555555555';
alter table public.contestants enable trigger contestants_freeze_locked;
alter table public.criteria enable trigger criteria_freeze_locked;
alter table public.judges enable trigger judges_freeze_locked;

insert into public.contests (id, name, status) values
  ('55555555-5555-4555-8555-555555555555', 'Step4 Test', 'draft');

insert into public.contestants (id, contest_id, name, number) values
  ('55111111-5511-4511-8511-111111111111', '55555555-5555-4555-8555-555555555555', 'Contestant A', 1),
  ('55122222-5512-4512-8512-121212121212', '55555555-5555-4555-8555-555555555555', 'Contestant B', 2);

insert into public.criteria (id, contest_id, name, weight) values
  ('55211111-5521-4511-8511-111111111111', '55555555-5555-4555-8555-555555555555', 'Beauty', 1.00),
  ('55222222-5522-4512-8512-121212121212', '55555555-5555-4555-8555-555555555555', 'Poise', 1.50);

insert into public.judges (id, user_id, contest_id, name, is_admin, is_active) values
  ('55311111-5531-4511-8511-111111111111', '__JUDGE1__', '55555555-5555-4555-8555-555555555555', 'Judge One', false, true),
  ('55322222-5532-4512-8512-121212121212', '__JUDGE2__', '55555555-5555-4555-8555-555555555555', 'Judge Two', false, true),
  ('55333333-5533-4513-8513-131313131313', '__ADMIN__', '55555555-5555-4555-8555-555555555555', 'Admin', true, true),
  ('55344444-5534-4514-8514-141414141414', '__INACTIVE__', '55555555-5555-4555-8555-555555555555', 'Inactive', false, false);

-- Judge One: complete (all 4), none final yet.
insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value) values
  ('55555555-5555-4555-8555-555555555555', '55111111-5511-4511-8511-111111111111', '55311111-5531-4511-8511-111111111111', '55211111-5521-4511-8511-111111111111', 7.0),
  ('55555555-5555-4555-8555-555555555555', '55111111-5511-4511-8511-111111111111', '55311111-5531-4511-8511-111111111111', '55222222-5522-4512-8512-121212121212', 8.0),
  ('55555555-5555-4555-8555-555555555555', '55122222-5512-4512-8512-121212121212', '55311111-5531-4511-8511-111111111111', '55211111-5521-4511-8511-111111111111', 6.5),
  ('55555555-5555-4555-8555-555555555555', '55122222-5512-4512-8512-121212121212', '55311111-5531-4511-8511-111111111111', '55222222-5522-4512-8512-121212121212', 9.0);

-- Judge Two: incomplete (1 of 4).
insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value) values
  ('55555555-5555-4555-8555-555555555555', '55111111-5511-4511-8511-111111111111', '55322222-5532-4512-8512-121212121212', '55211111-5521-4511-8511-111111111111', 5.0);

-- Open AFTER seeding: the structure freeze forbids building into an open contest.
update public.contests set status = 'open'
  where id = '55555555-5555-4555-8555-555555555555';

-- @@NEXT@@
-- ── TEST a: incomplete submit is rejected with the missing list ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE2__"}';
do $t$
declare v_res jsonb;
begin
  select public.submit_final_scores('55555555-5555-4555-8555-555555555555') into v_res;
  if (v_res->>'ok')::boolean = false and jsonb_array_length(v_res->'missing') = 3 then
    raise notice 'PASS a/6: incomplete submit rejected, 3 missing listed';
  else
    raise exception 'FAIL a/6: unexpected result %', v_res;
  end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST b: complete submit finalizes every row ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE1__"}';
do $t$
declare v_res jsonb; v_n integer;
begin
  select public.submit_final_scores('55555555-5555-4555-8555-555555555555') into v_res;
  if (v_res->>'ok')::boolean is not true or (v_res->>'finalized')::integer <> 4 then
    raise exception 'FAIL b/6: unexpected result %', v_res;
  end if;
  select count(*) into v_n from public.scores
    where judge_id = '55311111-5531-4511-8511-111111111111' and is_final and submitted_at is not null;
  if v_n = 4 then raise notice 'PASS b/6: complete submit finalized 4 rows with submitted_at';
  else raise exception 'FAIL b/6: only % of 4 rows final+stamped', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST c: edits after submit are rejected by RLS ──
-- (TEST b rolled back, so finalize for real first inside this block.)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE1__"}';
do $t$
declare v_res jsonb; v_n integer;
begin
  select public.submit_final_scores('55555555-5555-4555-8555-555555555555') into v_res;
  if (v_res->>'ok')::boolean is not true then
    raise exception 'FAIL c/6: setup submit failed: %', v_res;
  end if;
  update public.scores set value = 1.0
    where judge_id = '55311111-5531-4511-8511-111111111111';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'PASS c/6: post-submit edits affect 0 rows';
  else raise exception 'FAIL c/6: post-submit edit affected % rows', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST d: a judge cannot submit for (or disturb) another judge ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE2__"}';
do $t$
declare v_res jsonb; v_n integer;
begin
  select public.submit_final_scores('55555555-5555-4555-8555-555555555555') into v_res;
  if (v_res->>'ok')::boolean = false then
    raise notice 'PASS d/6: one judge''s call finalizes nothing but their own (still incomplete → rejected)';
  else
    raise exception 'FAIL d/6: unexpected result %', v_res;
  end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST d2: peer judge rows untouched (observed as admin) ──
-- (Each block rolls back, so Judge One's rows must still be non-final here.)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADMIN__"}';
do $t$
declare v_n integer;
begin
  select count(*) into v_n from public.scores
    where judge_id = '55311111-5531-4511-8511-111111111111' and is_final = false;
  if v_n = 4 then raise notice 'PASS d2/6: peer judge rows untouched (4 non-final)';
  else raise exception 'FAIL d2/6: peer rows disturbed (% non-final)', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST e: admin and inactive judges cannot submit ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADMIN__"}';
do $t$
begin
  perform public.submit_final_scores('55555555-5555-4555-8555-555555555555');
  raise exception 'FAIL e/6: admin submit was allowed';
exception when insufficient_privilege then
  raise notice 'PASS e/6: admin submit rejected';
end $t$;
rollback;

-- @@NEXT@@
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__INACTIVE__"}';
do $t$
begin
  perform public.submit_final_scores('55555555-5555-4555-8555-555555555555');
  raise exception 'FAIL e2/6: inactive submit was allowed';
exception when insufficient_privilege then
  raise notice 'PASS e2/6: inactive submit rejected';
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST f: submit on a locked contest is rejected ──
update public.contests set status = 'locked'
  where id = '55555555-5555-4555-8555-555555555555';

-- @@NEXT@@
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE2__"}';
do $t$
begin
  perform public.submit_final_scores('55555555-5555-4555-8555-555555555555');
  raise exception 'FAIL f/6: locked submit was allowed';
exception when insufficient_privilege then
  if sqlerrm like '%not open%' then
    raise notice 'PASS f/6: locked submit rejected (contest is not open)';
  else
    raise exception 'FAIL f/6: wrong error: %', sqlerrm;
  end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── CLEANUP (superuser) ─────────────────────────────
-- Same discipline as the prologue: freeze triggers disabled, explicit
-- scores → judges order, triggers re-enabled.
alter table public.contestants disable trigger contestants_freeze_locked;
alter table public.criteria disable trigger criteria_freeze_locked;
alter table public.judges disable trigger judges_freeze_locked;
delete from public.scores where contest_id = '55555555-5555-4555-8555-555555555555';
delete from public.judges where contest_id = '55555555-5555-4555-8555-555555555555';
delete from public.contests where id = '55555555-5555-4555-8555-555555555555';
delete from public.score_history where contest_id = '55555555-5555-4555-8555-555555555555';
alter table public.contestants enable trigger contestants_freeze_locked;
alter table public.criteria enable trigger criteria_freeze_locked;
alter table public.judges enable trigger judges_freeze_locked;
