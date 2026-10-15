-- ════════════════════════════════════════════════════════════════
-- CWPC Step 8 verification — audit trail + runbook reopen procedure.
-- Fixtures: one OPEN contest (edit log + reopen-ok) and one DRAFT
-- contest (edits stay unaudited). Users: __ADM__ (admin) + __J1__
-- (judge with one final score on the open contest).
-- Run via the step-8 DB runner (substitutes + deletes users).
-- ════════════════════════════════════════════════════════════════

-- @@NEXT@@
-- ── SETUP (superuser, bypasses RLS) ─────────────────────────────
alter table public.contestants disable trigger contestants_freeze_locked;
alter table public.criteria disable trigger criteria_freeze_locked;
alter table public.judges disable trigger judges_freeze_locked;
delete from public.scores where contest_id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
delete from public.judges where contest_id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
delete from public.contests where id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
delete from public.score_history where contest_id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
delete from public.contestant_edit_log where contest_id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
delete from public.score_reopen_log where contest_id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
alter table public.contestants enable trigger contestants_freeze_locked;
alter table public.criteria enable trigger criteria_freeze_locked;
alter table public.judges enable trigger judges_freeze_locked;

insert into public.contests (id, name, status) values
  ('12121212-1212-4121-8121-121212121212', 'Step8 Open', 'draft'),
  ('13131313-1313-4131-8131-131313131313', 'Step8 Draft', 'draft');

insert into public.contestants (id, contest_id, name, number) values
  ('12111212-1211-4121-8121-121112121212', '12121212-1212-4121-8121-121212121212', 'Open One', 1),
  ('13111313-1311-4131-8131-131113131313', '13131313-1313-4131-8131-131313131313', 'Draft One', 1);

insert into public.criteria (id, contest_id, name, weight) values
  ('12121212-1212-4121-8121-121212121213', '12121212-1212-4121-8121-121212121212', 'Crit', 1.00);

insert into public.judges (id, user_id, contest_id, name, is_admin, is_active) values
  ('12131212-1213-4121-8121-121312121212', '__ADM__', '12121212-1212-4121-8121-121212121212', 'Admin', true, true),
  ('12141212-1214-4121-8121-121412121212', '__J1__', '12121212-1212-4121-8121-121212121212', 'Judge One', false, true);

insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value, is_final, submitted_at) values
  ('12121212-1212-4121-8121-121212121212', '12111212-1211-4121-8121-121112121212', '12141212-1214-4121-8121-121412121212', '12121212-1212-4121-8121-121212121213', 8.5, true, now());

-- Open AFTER seeding: the structure freeze forbids building into an open contest.
update public.contests set status = 'open'
  where id = '12121212-1212-4121-8121-121212121212';

-- @@NEXT@@
-- ── TEST 1: name/photo edits while open are audited ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADM__"}';
do $t$
declare v_n integer; r record;
begin
  update public.contestants set name = 'Open One (renamed)', photo_url = 'p/1/new.png'
    where id = '12111212-1211-4121-8121-121112121212';
  select count(*) into v_n from public.contestant_edit_log
    where contestant_id = '12111212-1211-4121-8121-121112121212';
  if v_n <> 1 then raise exception 'FAIL 1/5: log rows = %, expected 1', v_n; end if;

  select changed_by, old_name, new_name, old_photo_url, new_photo_url
    into r from public.contestant_edit_log
    where contestant_id = '12111212-1211-4121-8121-121112121212';
  if r.changed_by = '__ADM__' and r.old_name = 'Open One' and r.new_name = 'Open One (renamed)'
     and r.old_photo_url is null and r.new_photo_url = 'p/1/new.png' then
    raise notice 'PASS 1/5: edit logged with who/when/old/new';
  else
    raise exception 'FAIL 1/5: log content wrong';
  end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 2: draft edits are NOT audited; judges cannot read the log ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADM__"}';
do $t$
declare v_n integer;
begin
  update public.contestants set name = 'Draft One (renamed)'
    where id = '13111313-1311-4131-8131-131113131313';
  select count(*) into v_n from public.contestant_edit_log
    where contestant_id = '13111313-1311-4131-8131-131113131313';
  if v_n = 0 then raise notice 'PASS 2/5: draft edits stay unaudited';
  else raise exception 'FAIL 2/5: draft edit logged'; end if;
end $t$;
rollback;

-- @@NEXT@@
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__J1__"}';
do $t$
declare v_n integer;
begin
  select count(*) into v_n from public.contestant_edit_log;
  if v_n = 0 then raise notice 'PASS 2b/5: edit log hidden from judges';
  else raise exception 'FAIL 2b/5: judge sees % log rows', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 3: runbook reopen works on open (scores + audit row) ──
-- (Same statements as RUNBOOK.md; runs as superuser there too.)
do $t$
declare v_n integer; v_log integer;
begin
  if (select status from public.contests where id = '12121212-1212-4121-8121-121212121212') = 'locked' then
    raise exception 'cannot reopen scores in a locked contest';
  end if;
  update public.scores set is_final = false, submitted_at = null
    where contest_id = '12121212-1212-4121-8121-121212121212'
      and judge_id = '12141212-1214-4121-8121-121412121212'
      and is_final = true;
  get diagnostics v_n = row_count;
  insert into public.score_reopen_log (contest_id, judge_id, reason)
    values ('12121212-1212-4121-8121-121212121212',
            '12141212-1214-4121-8121-121412121212',
            'TEST 3: accidental submit during rehearsal');
  select count(*) into v_log from public.score_reopen_log
    where contest_id = '12121212-1212-4121-8121-121212121212';
  if v_n = 1 and v_log = 1 then
    raise notice 'PASS 3/5: reopened 1 score + audit row on open contest';
  else
    raise exception 'FAIL 3/5: reopened=% log=%', v_n, v_log;
  end if;
end $t$;

-- @@NEXT@@
-- ── re-finalize (superuser) so TEST 4 starts from submitted ──
update public.scores set is_final = true, submitted_at = now()
  where contest_id = '12121212-1212-4121-8121-121212121212'
    and judge_id = '12141212-1214-4121-8121-121412121212';

-- @@NEXT@@
-- ── lock (superuser) ──
update public.contests set status = 'locked'
  where id = '12121212-1212-4121-8121-121212121212';

-- @@NEXT@@
-- ── TEST 4: runbook reopen refuses on locked ──
do $t$
begin
  if (select status from public.contests where id = '12121212-1212-4121-8121-121212121212') = 'locked' then
    raise exception 'cannot reopen scores in a locked contest';
  end if;
  raise exception 'FAIL 4/5: locked reopen allowed';
exception when raise_exception then
  if sqlerrm = 'cannot reopen scores in a locked contest' then
    raise notice 'PASS 4/5: locked reopen refused';
  else
    raise exception 'FAIL 4/5: wrong error: %', sqlerrm;
  end if;
end $t$;

-- @@NEXT@@
-- ── CLEANUP (superuser) ─────────────────────────────
alter table public.contestants disable trigger contestants_freeze_locked;
alter table public.criteria disable trigger criteria_freeze_locked;
alter table public.judges disable trigger judges_freeze_locked;
delete from public.scores where contest_id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
delete from public.judges where contest_id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
delete from public.contests where id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
delete from public.score_history where contest_id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
delete from public.contestant_edit_log where contest_id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
delete from public.score_reopen_log where contest_id in
  ('12121212-1212-4121-8121-121212121212',
   '13131313-1313-4131-8131-131313131313');
alter table public.contestants enable trigger contestants_freeze_locked;
alter table public.criteria enable trigger criteria_freeze_locked;
alter table public.judges enable trigger judges_freeze_locked;
