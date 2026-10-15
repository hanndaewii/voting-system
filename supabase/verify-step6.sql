-- ════════════════════════════════════════════════════════════════
-- CWPC Step 6 verification — proves the admin functions, the judges
-- freeze, and the realtime publication.
-- Sample (criteria A x1.00 + B x2.00):
--   Judge One (complete, final): 9,9,8,7,10,6 -> avg 8.17, outstanding 3
--   Judge Two (partial, draft):   9,8,7        -> avg 8.00, outstanding 1
--   Judge Three: nothing. Judge Four (inactive): one 9.5 draft-excluded row.
--   Admin scores are excluded everywhere.
-- Expected summary: contestants 3, scores 9, average 8.11, outstanding 4,
-- judges total 3, submitted 1.
-- Run via the step-6 DB runner (substitutes 5 temp auth users, deletes
-- them afterwards). Manual run: create the users and substitute the
-- __J1__..__J4__ and __ADM__ placeholders.
-- ════════════════════════════════════════════════════════════════

-- @@NEXT@@
-- ── SETUP (superuser, bypasses RLS) ─────────────────────────────
-- Prologue: clear leftovers (freeze triggers disabled + re-enabled).
alter table public.contestants disable trigger contestants_freeze_locked;
alter table public.criteria disable trigger criteria_freeze_locked;
alter table public.judges disable trigger judges_freeze_locked;
delete from public.scores where contest_id = '77777777-7777-4777-8777-777777777777';
delete from public.judges where contest_id = '77777777-7777-4777-8777-777777777777';
delete from public.contests where id = '77777777-7777-4777-8777-777777777777';
delete from public.score_history where contest_id = '77777777-7777-4777-8777-777777777777';
alter table public.contestants enable trigger contestants_freeze_locked;
alter table public.criteria enable trigger criteria_freeze_locked;
alter table public.judges enable trigger judges_freeze_locked;

insert into public.contests (id, name, status) values
  ('77777777-7777-4777-8777-777777777777', 'Step6 Test', 'draft');

insert into public.contestants (id, contest_id, name, number) values
  ('77111111-7711-4711-8711-111111111111', '77777777-7777-4777-8777-777777777777', 'Contestant One', 1),
  ('77122222-7712-4712-8712-121212121212', '77777777-7777-4777-8777-777777777777', 'Contestant Two', 2),
  ('77133333-7713-4713-8713-131313131313', '77777777-7777-4777-8777-777777777777', 'Contestant Three', 3);

insert into public.criteria (id, contest_id, name, weight) values
  ('77211111-7721-4711-8711-111111111111', '77777777-7777-4777-8777-777777777777', 'Crit A', 1.00),
  ('77222222-7722-4712-8712-121212121212', '77777777-7777-4777-8777-777777777777', 'Crit B', 2.00);

insert into public.judges (id, user_id, contest_id, name, is_admin, is_active) values
  ('77311111-7731-4711-8711-111111111111', '__J1__', '77777777-7777-4777-8777-777777777777', 'Judge One', false, true),
  ('77322222-7732-4712-8712-121212121212', '__J2__', '77777777-7777-4777-8777-777777777777', 'Judge Two', false, true),
  ('77333333-7733-4713-8713-131313131313', '__J3__', '77777777-7777-4777-8777-777777777777', 'Judge Three', false, true),
  ('77344444-7734-4714-8714-141414141414', '__J4__', '77777777-7777-4777-8777-777777777777', 'Judge Four', false, false),
  ('77355555-7735-4715-8715-151515151515', '__ADM__', '77777777-7777-4777-8777-777777777777', 'Admin', true, true);

-- Judge One: complete + final (9,9,8,7,10,6).
insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value, is_final) values
  ('77777777-7777-4777-8777-777777777777', '77111111-7711-4711-8711-111111111111', '77311111-7731-4711-8711-111111111111', '77211111-7721-4711-8711-111111111111', 9.0, true),
  ('77777777-7777-4777-8777-777777777777', '77111111-7711-4711-8711-111111111111', '77311111-7731-4711-8711-111111111111', '77222222-7722-4712-8712-121212121212', 9.0, true),
  ('77777777-7777-4777-8777-777777777777', '77122222-7712-4712-8712-121212121212', '77311111-7731-4711-8711-111111111111', '77211111-7721-4711-8711-111111111111', 8.0, true),
  ('77777777-7777-4777-8777-777777777777', '77122222-7712-4712-8712-121212121212', '77311111-7731-4711-8711-111111111111', '77222222-7722-4712-8712-121212121212', 7.0, true),
  ('77777777-7777-4777-8777-777777777777', '77133333-7713-4713-8713-131313131313', '77311111-7731-4711-8711-111111111111', '77211111-7721-4711-8711-111111111111', 10.0, true),
  ('77777777-7777-4777-8777-777777777777', '77133333-7713-4713-8713-131313131313', '77311111-7731-4711-8711-111111111111', '77222222-7722-4712-8712-121212121212', 6.0, true);

-- Judge Two: partial draft (9,8,7) — counts as activity, not submission.
insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value, is_final) values
  ('77777777-7777-4777-8777-777777777777', '77111111-7711-4711-8711-111111111111', '77322222-7732-4712-8712-121212121212', '77211111-7721-4711-8711-111111111111', 9.0, false),
  ('77777777-7777-4777-8777-777777777777', '77111111-7711-4711-8711-111111111111', '77322222-7732-4712-8712-121212121212', '77222222-7722-4712-8712-121212121212', 8.0, false),
  ('77777777-7777-4777-8777-777777777777', '77122222-7712-4712-8712-121212121212', '77322222-7732-4712-8712-121212121212', '77211111-7721-4711-8711-111111111111', 7.0, false);

-- Judge Four (inactive): must not affect any totals.
insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value, is_final) values
  ('77777777-7777-4777-8777-777777777777', '77111111-7711-4711-8711-111111111111', '77344444-7734-4714-8714-141414141414', '77211111-7721-4711-8711-111111111111', 9.5, true);

-- Admin: must not affect any totals.
insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value, is_final) values
  ('77777777-7777-4777-8777-777777777777', '77111111-7711-4711-8711-111111111111', '77355555-7735-4715-8715-151515151515', '77211111-7721-4711-8711-111111111111', 10.0, true),
  ('77777777-7777-4777-8777-777777777777', '77111111-7711-4711-8711-111111111111', '77355555-7735-4715-8715-151515151515', '77222222-7722-4712-8712-121212121212', 10.0, true);

-- Open AFTER seeding: the structure freeze forbids building into an open contest.
update public.contests set status = 'open'
  where id = '77777777-7777-4777-8777-777777777777';

-- @@NEXT@@
-- ── TEST 1: admin_summary exact numbers ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADM__"}';
do $t$
declare r record;
begin
  select * into r from public.admin_summary('77777777-7777-4777-8777-777777777777');
  if r.total_contestants = 3 and r.total_scores = 9 and r.average_score = 8.11
     and r.outstanding_scores = 4 and r.judges_total = 3 and r.judges_submitted = 1 then
    raise notice 'PASS 1/6: summary = 3 contestants, 9 scores, avg 8.11, 4 outstanding, 3 judges, 1 submitted';
  else
    raise exception 'FAIL 1/6: summary wrong: contestants=% scores=% avg=% outstanding=% judges=% submitted=%',
      r.total_contestants, r.total_scores, r.average_score, r.outstanding_scores, r.judges_total, r.judges_submitted;
  end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 2: admin_judge_progress exact rows ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADM__"}';
do $t$
declare r1 record; r2 record; r3 record; r4 record; v_n integer;
begin
  select count(*) into v_n from public.admin_judge_progress('77777777-7777-4777-8777-777777777777');
  if v_n <> 4 then raise exception 'FAIL 2/6: progress rows = %, expected 4', v_n; end if;

  select * into r1 from public.admin_judge_progress('77777777-7777-4777-8777-777777777777') where name = 'Judge One';
  select * into r2 from public.admin_judge_progress('77777777-7777-4777-8777-777777777777') where name = 'Judge Two';
  select * into r3 from public.admin_judge_progress('77777777-7777-4777-8777-777777777777') where name = 'Judge Three';
  select * into r4 from public.admin_judge_progress('77777777-7777-4777-8777-777777777777') where name = 'Judge Four';

  if r1.contestants_scored = 3 and r1.total_contestants = 3 and r1.has_submitted
     and r1.average_score_given = 8.17 and r1.outstanding_count = 3 and r1.is_active then
    raise notice 'PASS 2/6: Judge One 3/3 submitted, avg 8.17, 3 outstanding';
  else
    raise exception 'FAIL 2/6: Judge One wrong: %/% submitted=% avg=% outstanding=%',
      r1.contestants_scored, r1.total_contestants, r1.has_submitted, r1.average_score_given, r1.outstanding_count;
  end if;

  if r2.contestants_scored = 1 and r2.total_contestants = 3 and not r2.has_submitted
     and r2.average_score_given = 8.00 and r2.outstanding_count = 1 and r2.is_active then
    raise notice 'PASS 2b/6: Judge Two 1/3 in progress, avg 8.00, 1 outstanding';
  else
    raise exception 'FAIL 2b/6: Judge Two wrong: %/% submitted=% avg=% outstanding=%',
      r2.contestants_scored, r2.total_contestants, r2.has_submitted, r2.average_score_given, r2.outstanding_count;
  end if;

  if r3.contestants_scored = 0 and not r3.has_submitted
     and r3.average_score_given is null and r3.outstanding_count = 0 and r3.is_active then
    raise notice 'PASS 2c/6: Judge Three 0/3, no average, 0 outstanding';
  else
    raise exception 'FAIL 2c/6: Judge Three wrong';
  end if;

  if r4.contestants_scored = 0 and not r4.has_submitted
     and r4.average_score_given = 9.5 and r4.outstanding_count = 1 and not r4.is_active then
    raise notice 'PASS 2d/6: Judge Four listed as revoked (avg 9.5 kept on their row, excluded from totals)';
  else
    raise exception 'FAIL 2d/6: Judge Four wrong';
  end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 3: judge and anon calls are rejected ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__J1__"}';
do $t$
begin
  perform public.admin_summary('77777777-7777-4777-8777-777777777777');
  raise exception 'FAIL 3/6: judge admin_summary allowed';
exception when insufficient_privilege then
  raise notice 'PASS 3/6: judge admin_summary rejected';
end $t$;
rollback;

-- @@NEXT@@
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__J1__"}';
do $t$
begin
  perform public.admin_judge_progress('77777777-7777-4777-8777-777777777777');
  raise exception 'FAIL 3b/6: judge admin_judge_progress allowed';
exception when insufficient_privilege then
  raise notice 'PASS 3b/6: judge admin_judge_progress rejected';
end $t$;
rollback;

-- @@NEXT@@
begin;
set local role anon;
do $t$
begin
  perform public.admin_summary('77777777-7777-4777-8777-777777777777');
  raise exception 'FAIL 3c/6: anon admin_summary allowed';
exception when insufficient_privilege then
  raise notice 'PASS 3c/6: anon admin_summary rejected';
end $t$;
rollback;

-- @@NEXT@@
-- ── lock the contest (superuser) ──
update public.contests set status = 'locked'
  where id = '77777777-7777-4777-8777-777777777777';

-- @@NEXT@@
-- ── TEST 4: judges freeze holds even for admins ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADM__"}';
do $t$
declare v_ok integer := 0;
begin
  begin
    update public.judges set is_active = false
      where id = '77322222-7732-4712-8712-121212121212';
    raise exception 'FAIL 4/6: revoking a judge in a locked contest allowed';
  exception when raise_exception then v_ok := v_ok + 1;
  end;

  begin
    delete from public.judges
      where id = '77322222-7732-4712-8712-121212121212';
    raise exception 'FAIL 4/6: deleting a judge in a locked contest allowed';
  exception when raise_exception then v_ok := v_ok + 1;
  end;

  begin
    -- BEFORE trigger fires before the FK check, so even a bogus user_id
    -- is rejected by the freeze (not by the foreign key).
    insert into public.judges (user_id, contest_id, name)
      values ('00000000-0000-4000-8000-000000000000',
              '77777777-7777-4777-8777-777777777777', 'Sneaky Judge');
    raise exception 'FAIL 4/6: inserting a judge in a locked contest allowed';
  exception when raise_exception then v_ok := v_ok + 1;
  end;

  -- Admin rows staying admins remain manageable (sanity: allowed).
  update public.judges set name = 'Admin (renamed)'
    where id = '77355555-7735-4715-8715-151515151515';
  v_ok := v_ok + 1;

  if v_ok = 4 then raise notice 'PASS 4/6: locked judges freeze holds (revoke/delete/insert blocked, admin row editable)';
  else raise exception 'FAIL 4/6: only % of 4 freeze checks behaved', v_ok; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 5: realtime publication contains scores + contests ──
do $t$
declare v_n integer;
begin
  select count(*) into v_n from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
    and tablename in ('scores', 'contests');
  if v_n = 2 then raise notice 'PASS 5/6: scores + contests in supabase_realtime';
  else raise exception 'FAIL 5/6: only % of 2 tables published', v_n; end if;
end $t$;

-- @@NEXT@@
-- ── CLEANUP (superuser) ─────────────────────────────
-- Freeze triggers disabled + re-enabled; explicit scores → judges order
-- avoids the scores_judge_fk NO ACTION trap.
alter table public.contestants disable trigger contestants_freeze_locked;
alter table public.criteria disable trigger criteria_freeze_locked;
alter table public.judges disable trigger judges_freeze_locked;
delete from public.scores where contest_id = '77777777-7777-4777-8777-777777777777';
delete from public.judges where contest_id = '77777777-7777-4777-8777-777777777777';
delete from public.contests where id = '77777777-7777-4777-8777-777777777777';
delete from public.score_history where contest_id = '77777777-7777-4777-8777-777777777777';
alter table public.contestants enable trigger contestants_freeze_locked;
alter table public.criteria enable trigger criteria_freeze_locked;
alter table public.judges enable trigger judges_freeze_locked;
