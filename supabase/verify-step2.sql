-- ════════════════════════════════════════════════════════════════
-- CWPC Step 2 verification — proves the RLS policies with simulated JWTs.
-- Run via the step-2 runner: it creates 4 temp auth users and substitutes
-- their UUIDs for __JUDGE1__ / __JUDGE2__ / __ADMIN__ / __INACTIVE__,
-- then deletes the users afterwards. Test data is rolled back per block
-- and the 3 test contests are deleted at the end.
-- Manual run: create 4 auth users, substitute the placeholders, and run
-- the whole script (setup commits; each BEGIN…ROLLBACK block is atomic).
-- ════════════════════════════════════════════════════════════════

-- @@NEXT@@
-- ── SETUP (superuser, bypasses RLS) ─────────────────────────────
-- Prologue: clear leftovers from an interrupted run (no-op when clean).
-- Contests first (cascade + trigger write history), history wipe second.
delete from public.contests where id in
  ('11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333');
delete from public.score_history where contest_id in
  ('11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333');

insert into public.contests (id, name, status) values
  ('11111111-1111-4111-8111-111111111111', 'Step2 Test Open', 'draft'),
  ('22222222-2222-4222-8222-222222222222', 'Step2 Test Locked', 'draft'),
  ('33333333-3333-4333-8333-333333333333', 'Step2 Test Draft', 'draft');

insert into public.contestants (id, contest_id, name, number) values
  ('10111111-1011-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Open A', 1),
  ('10122222-1012-4112-8112-121212121212', '11111111-1111-4111-8111-111111111111', 'Open B', 2),
  ('10211111-1021-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Locked A', 1),
  ('10311111-1031-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'Draft A', 1),
  ('10133333-1013-4113-8113-131313131313', '11111111-1111-4111-8111-111111111111', 'Open C', 3);

insert into public.criteria (id, contest_id, name, weight) values
  ('20111111-2011-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Poise', 1.00),
  ('20211111-2021-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Poise', 1.00),
  ('20311111-2031-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'Poise', 1.00);

insert into public.judges (id, user_id, contest_id, name, is_admin, is_active) values
  ('30111111-3011-4111-8111-111111111111', '__JUDGE1__', '11111111-1111-4111-8111-111111111111', 'Judge One', false, true),
  ('30122222-3012-4112-8112-121212121212', '__JUDGE1__', '22222222-2222-4222-8222-222222222222', 'Judge One', false, true),
  ('30133333-3013-4113-8113-131313131313', '__JUDGE1__', '33333333-3333-4333-8333-333333333333', 'Judge One', false, true),
  ('30211111-3021-4111-8111-111111111111', '__JUDGE2__', '11111111-1111-4111-8111-111111111111', 'Judge Two', false, true),
  ('30222222-3022-4112-8112-121212121212', '__JUDGE2__', '22222222-2222-4222-8222-222222222222', 'Judge Two', false, true),
  ('30311111-3031-4111-8111-111111111111', '__ADMIN__', '11111111-1111-4111-8111-111111111111', 'Admin', true, true),
  ('30411111-3041-4111-8111-111111111111', '__INACTIVE__', '11111111-1111-4111-8111-111111111111', 'Inactive Judge', false, false);

insert into public.scores (id, contest_id, contestant_id, judge_id, criterion_id, value, is_final, submitted_at) values
  ('40111111-4011-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '10111111-1011-4111-8111-111111111111', '30111111-3011-4111-8111-111111111111', '20111111-2011-4111-8111-111111111111', 7.0, false, null),
  ('40122222-4012-4112-8112-121212121212', '11111111-1111-4111-8111-111111111111', '10122222-1012-4112-8112-121212121212', '30111111-3011-4111-8111-111111111111', '20111111-2011-4111-8111-111111111111', 8.0, true, now()),
  ('40211111-4021-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '10111111-1011-4111-8111-111111111111', '30211111-3021-4111-8111-111111111111', '20111111-2011-4111-8111-111111111111', 6.5, false, null),
  ('40311111-4031-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '10211111-1021-4111-8111-111111111111', '30122222-3012-4112-8112-121212121212', '20211111-2021-4111-8111-111111111111', 9.0, false, null),
  ('40322222-4032-4112-8112-121212121212', '22222222-2222-4222-8222-222222222222', '10211111-1021-4111-8111-111111111111', '30222222-3022-4112-8112-121212121212', '20211111-2021-4111-8111-111111111111', 5.5, false, null);

-- Throwaway score: seeds 2 history rows (UPDATE + DELETE) for the admin test.
insert into public.scores (id, contest_id, contestant_id, judge_id, criterion_id, value) values
  ('40411111-4041-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '10122222-1012-4112-8112-121212121212', '30211111-3021-4111-8111-111111111111', '20111111-2011-4111-8111-111111111111', 5.0);
update public.scores set value = 6.0 where id = '40411111-4041-4111-8111-111111111111';
delete from public.scores where id = '40411111-4041-4111-8111-111111111111';

-- Open/lock AFTER seeding: the structure freeze forbids building data
-- in an open or locked contest (draft -> open -> locked only).
update public.contests set status = 'open'
  where id = '11111111-1111-4111-8111-111111111111';
update public.contests set status = 'open'
  where id = '22222222-2222-4222-8222-222222222222';
update public.contests set status = 'locked'
  where id = '22222222-2222-4222-8222-222222222222';

-- @@NEXT@@
-- ── TEST 0: judge positives (own data readable/writable while open) ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE1__"}';
do $t$
declare v_n integer;
begin
  -- own 2 (open) + locked contest fully visible (2) = 4; J2's open score hidden
  select count(*) into v_n from public.scores;
  if v_n = 4 then raise notice 'PASS 0/10: judge sees own + locked-contest scores (4)';
  else raise exception 'FAIL 0/10: judge sees % scores, expected 4', v_n; end if;

  select count(*) into v_n from public.contests;
  if v_n = 3 then raise notice 'PASS 0b/10: judge reads own contests (3)';
  else raise exception 'FAIL 0b/10: judge sees % contests, expected 3', v_n; end if;

  select count(*) into v_n from public.contestants;
  if v_n = 5 then raise notice 'PASS 0c/10: judge reads contestants (5)';
  else raise exception 'FAIL 0c/10: judge sees % contestants, expected 5', v_n; end if;

  insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value)
    values ('11111111-1111-4111-8111-111111111111', '10133333-1013-4113-8113-131313131313',
            '30111111-3011-4111-8111-111111111111', '20111111-2011-4111-8111-111111111111', 7.5);
  raise notice 'PASS 0d/10: judge inserts own score while open';

  update public.scores set value = 7.0 where id = '40111111-4011-4111-8111-111111111111';
  get diagnostics v_n = row_count;
  if v_n = 1 then raise notice 'PASS 0e/10: judge updates own non-final score';
  else raise exception 'FAIL 0e/10: own update affected % rows', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 1: judge cannot read another judge's scores (open contest) ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE1__"}';
do $t$
declare v_n integer;
begin
  select count(*) into v_n from public.scores
    where judge_id = '30211111-3021-4111-8111-111111111111'
      and contest_id = '11111111-1111-4111-8111-111111111111';
  if v_n = 0 then raise notice 'PASS 1/10: other judge''s open-contest scores hidden';
  else raise exception 'FAIL 1/10: leaked % of another judge''s scores', v_n; end if;

  select count(*) into v_n from public.scores
    where judge_id = '30111111-3011-4111-8111-111111111111'
      and contest_id = '11111111-1111-4111-8111-111111111111';
  if v_n = 2 then raise notice 'PASS 1b/10: own open-contest scores visible (2)';
  else raise exception 'FAIL 1b/10: own scores visible = %, expected 2', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 2: judge cannot edit after submitting (is_final) ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE1__"}';
do $t$
declare v_n integer;
begin
  update public.scores set value = 9.0 where id = '40122222-4012-4112-8112-121212121212';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'PASS 2/10: final score not editable';
  else raise exception 'FAIL 2/10: final score edit affected % rows', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 3: judge cannot edit once locked (but can now read all) ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE1__"}';
do $t$
declare v_n integer;
begin
  update public.scores set value = 1.0 where id = '40311111-4031-4111-8111-111111111111';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'PASS 3/10: locked-contest score not editable';
  else raise exception 'FAIL 3/10: locked edit affected % rows', v_n; end if;

  select count(*) into v_n from public.scores
    where contest_id = '22222222-2222-4222-8222-222222222222';
  if v_n = 2 then raise notice 'PASS 3b/10: locked contest fully visible (2)';
  else raise exception 'FAIL 3b/10: locked scores visible = %, expected 2', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 4: inactive judge sees nothing ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__INACTIVE__"}';
do $t$
declare v_n integer;
begin
  select (select count(*) from public.contests)
       + (select count(*) from public.contestants)
       + (select count(*) from public.criteria)
       + (select count(*) from public.judges)
       + (select count(*) from public.scores)
       + (select count(*) from public.score_history) into v_n;
  if v_n = 0 then raise notice 'PASS 4/10: inactive judge sees nothing';
  else raise exception 'FAIL 4/10: inactive judge sees % rows', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 5: judge cannot read history or other judges' rows ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE1__"}';
do $t$
declare v_n integer;
begin
  select count(*) into v_n from public.score_history;
  if v_n = 0 then raise notice 'PASS 5/10: score_history hidden from judge';
  else raise exception 'FAIL 5/10: judge sees % history rows', v_n; end if;

  select count(*) into v_n from public.judges where user_id <> '__JUDGE1__';
  if v_n = 0 then raise notice 'PASS 5b/10: other judges'' rows hidden';
  else raise exception 'FAIL 5b/10: judge sees % other judge rows', v_n; end if;

  select count(*) into v_n from public.judges;
  if v_n = 3 then raise notice 'PASS 5c/10: own judge rows visible (3 contests)';
  else raise exception 'FAIL 5c/10: own judge rows visible = %, expected 3', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 6: admin reads everything but cannot insert scores ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADMIN__"}';
do $t$
declare v_n integer;
begin
  -- Counts are scoped to the 3 fixture contests: the admin also sees
  -- real contests (e.g. Test Contest), which must not affect the asserts.
  select count(*) into v_n from public.contests where id in
    ('11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     '33333333-3333-4333-8333-333333333333');
  if v_n <> 3 then raise exception 'FAIL 6/10: admin sees % contests, expected 3', v_n; end if;
  select count(*) into v_n from public.contestants where contest_id in
    ('11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     '33333333-3333-4333-8333-333333333333');
  if v_n <> 5 then raise exception 'FAIL 6/10: admin sees % contestants, expected 5', v_n; end if;
  select count(*) into v_n from public.criteria where contest_id in
    ('11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     '33333333-3333-4333-8333-333333333333');
  if v_n <> 3 then raise exception 'FAIL 6/10: admin sees % criteria, expected 3', v_n; end if;
  select count(*) into v_n from public.judges where contest_id in
    ('11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     '33333333-3333-4333-8333-333333333333');
  if v_n <> 7 then raise exception 'FAIL 6/10: admin sees % judges, expected 7', v_n; end if;
  select count(*) into v_n from public.scores where contest_id in
    ('11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     '33333333-3333-4333-8333-333333333333');
  if v_n <> 5 then raise exception 'FAIL 6/10: admin sees % scores, expected 5', v_n; end if;
  select count(*) into v_n from public.score_history where contest_id in
    ('11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     '33333333-3333-4333-8333-333333333333');
  if v_n <> 2 then raise exception 'FAIL 6/10: admin sees % history rows, expected 2', v_n; end if;
  raise notice 'PASS 6/10: admin reads everything (3/5/3/7/5/2)';

  begin
    insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value)
      values ('11111111-1111-4111-8111-111111111111', '10111111-1011-4111-8111-111111111111',
              '30111111-3011-4111-8111-111111111111', '20111111-2011-4111-8111-111111111111', 9.0);
    raise exception 'FAIL 6b/10: admin score insert was allowed';
  exception when insufficient_privilege then
    raise notice 'PASS 6b/10: admin cannot insert scores';
  end;

  update public.scores set value = 1.0 where id = '40111111-4011-4111-8111-111111111111';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'PASS 6c/10: admin cannot update scores';
  else raise exception 'FAIL 6c/10: admin update affected % rows', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 7: anon sees nothing (fail-closed: 42501 on every table) ──
begin;
set local role anon;
do $t$
declare v_tbl text; v_ok integer := 0;
begin
  foreach v_tbl in array array['contests','contestants','criteria','judges','scores','score_history'] loop
    begin
      execute format('select count(*) from public.%I', v_tbl);
      raise exception 'FAIL 7/10: anon read % succeeded', v_tbl;
    exception when insufficient_privilege then
      v_ok := v_ok + 1;
    end;
  end loop;
  if v_ok = 6 then raise notice 'PASS 7/10: anon blocked on all 6 tables (42501)';
  else raise exception 'FAIL 7/10: anon blocked on only % of 6 tables', v_ok; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 8: helper functions executable by authenticated, not anon ──
do $t$
declare v_f text; v_bad integer := 0;
begin
  foreach v_f in array array['public.is_admin()','public.my_judge_id(uuid)','public.contest_status_of(uuid)'] loop
    if not has_function_privilege('authenticated', v_f, 'EXECUTE') then
      raise exception 'FAIL 8/10: authenticated lacks EXECUTE on %', v_f;
    end if;
    if has_function_privilege('anon', v_f, 'EXECUTE') then v_bad := v_bad + 1; end if;
  end loop;
  if v_bad = 0 then raise notice 'PASS 8/10: helpers granted to authenticated, revoked from anon';
  else raise exception 'FAIL 8/10: anon still executes % helpers', v_bad; end if;
end $t$;

-- @@NEXT@@
-- ── TEST 9: draft contest rejects inserts; judges cannot delete ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__JUDGE1__"}';
do $t$
declare v_n integer;
begin
  begin
    insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value)
      values ('33333333-3333-4333-8333-333333333333', '10311111-1031-4111-8111-111111111111',
              '30133333-3013-4113-8113-131313131313', '20311111-2031-4111-8111-111111111111', 8.0);
    raise exception 'FAIL 9/10: draft-contest insert was allowed';
  exception when insufficient_privilege then
    raise notice 'PASS 9/10: draft-contest insert rejected';
  end;

  delete from public.scores where id = '40111111-4011-4111-8111-111111111111';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'PASS 9b/10: judge cannot delete scores';
  else raise exception 'FAIL 9b/10: judge delete removed % rows', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── CLEANUP (superuser) ─────────────────────────────
-- Freeze triggers (Step 5) block child-row deletes on locked contests,
-- so maintenance runs with them disabled, then re-enables. Explicit
-- scores → judges order avoids the scores_judge_fk NO ACTION trap
-- (deleting users/judges while scores still reference them fails).
alter table public.contestants disable trigger contestants_freeze_locked;
alter table public.criteria disable trigger criteria_freeze_locked;
alter table public.judges disable trigger judges_freeze_locked;
delete from public.scores where contest_id in
  ('11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333');
delete from public.judges where contest_id in
  ('11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333');
delete from public.contests where id in
  ('11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333');
delete from public.score_history where contest_id in
  ('11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333');
alter table public.contestants enable trigger contestants_freeze_locked;
alter table public.criteria enable trigger criteria_freeze_locked;
alter table public.judges enable trigger judges_freeze_locked;
