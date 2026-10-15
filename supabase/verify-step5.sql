-- ════════════════════════════════════════════════════════════════
-- CWPC Step 5 verification — proves the ranking math and the freeze.
-- Sample: criteria Beauty x2.00 + Poise x1.00 (sum of weights = 3).
-- Star is scored 9.0 / 8.5 / 9.5 / 7.0 / 9.0 per judge
--   -> simple average 8.6, trimmed average 8.83.
-- Zebra and Apple tie at 8.00; Zebra's top criterion (10.0) beats
-- Apple's (8.0), and Zebra sorts after Apple alphabetically — so the
-- tie-breaker (not the name) decides the order.
-- Run via the step-5 DB runner (substitutes 10 temp auth users, deletes
-- them afterwards). Manual run: create the users, substitute the
-- __J1__..__J5__, __J6__, __J7__, __J8__, __ADM__, __INACT__ placeholders.
-- ════════════════════════════════════════════════════════════════

-- @@NEXT@@
-- ── SETUP (superuser, bypasses RLS) ─────────────────────────────
-- Prologue: clear leftovers from an interrupted run (no-op when clean).
alter table public.contestants disable trigger contestants_freeze_locked;
alter table public.criteria disable trigger criteria_freeze_locked;
alter table public.judges disable trigger judges_freeze_locked;
delete from public.scores where contest_id = '66666666-6666-4666-8666-666666666666';
delete from public.judges where contest_id = '66666666-6666-4666-8666-666666666666';
delete from public.contests where id = '66666666-6666-4666-8666-666666666666';
delete from public.score_history where contest_id = '66666666-6666-4666-8666-666666666666';
alter table public.contestants enable trigger contestants_freeze_locked;
alter table public.criteria enable trigger criteria_freeze_locked;
alter table public.judges enable trigger judges_freeze_locked;

insert into public.contests (id, name, status) values
  ('66666666-6666-4666-8666-666666666666', 'Step5 Test', 'draft');

insert into public.contestants (id, contest_id, name, number) values
  ('66111111-6611-4611-8611-111111111111', '66666666-6666-4666-8666-666666666666', 'Star', 1),
  ('66122222-6612-4612-8612-121212121212', '66666666-6666-4666-8666-666666666666', 'Zebra', 2),
  ('66133333-6613-4613-8613-131313131313', '66666666-6666-4666-8666-666666666666', 'Apple', 3);

insert into public.criteria (id, contest_id, name, weight) values
  ('66211111-6621-4611-8611-111111111111', '66666666-6666-4666-8666-666666666666', 'Beauty', 2.00),
  ('66222222-6622-4612-8612-121212121212', '66666666-6666-4666-8666-666666666666', 'Poise', 1.00);

insert into public.judges (id, user_id, contest_id, name, is_admin, is_active) values
  ('66311111-6631-4611-8611-111111111111', '__J1__', '66666666-6666-4666-8666-666666666666', 'Judge One', false, true),
  ('66322222-6632-4612-8612-121212121212', '__J2__', '66666666-6666-4666-8666-666666666666', 'Judge Two', false, true),
  ('66333333-6633-4613-8613-131313131313', '__J3__', '66666666-6666-4666-8666-666666666666', 'Judge Three', false, true),
  ('66344444-6634-4614-8614-141414141414', '__J4__', '66666666-6666-4666-8666-666666666666', 'Judge Four', false, true),
  ('66355555-6635-4615-8615-151515151515', '__J5__', '66666666-6666-4666-8666-666666666666', 'Judge Five', false, true),
  ('66366666-6636-4616-8616-161616161616', '__J6__', '66666666-6666-4666-8666-666666666666', 'Judge Six (partial)', false, true),
  ('66377777-6637-4617-8617-171717171717', '__J7__', '66666666-6666-4666-8666-666666666666', 'Judge Seven (draft)', false, true),
  ('66388888-6638-4618-8618-181818181818', '__J8__', '66666666-6666-4666-8666-666666666666', 'Judge Eight (inactive)', false, false),
  ('66399999-6639-4619-8619-191919191919', '__ADM__', '66666666-6666-4666-8666-666666666666', 'Admin', true, true),
  ('66300000-6630-4600-8600-101010101010', '__INACT__', '66666666-6666-4666-8666-666666666666', 'No Score Judge', false, false);

-- Star per-judge weighted avgs: J1 9.0, J2 (16+9.5)/3 = 8.5, J3 9.5, J4 7.0, J5 9.0.
insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value, is_final) values
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66311111-6631-4611-8611-111111111111', '66211111-6621-4611-8611-111111111111', 9.0, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66311111-6631-4611-8611-111111111111', '66222222-6622-4612-8612-121212121212', 9.0, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66322222-6632-4612-8612-121212121212', '66211111-6621-4611-8611-111111111111', 8.0, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66322222-6632-4612-8612-121212121212', '66222222-6622-4612-8612-121212121212', 9.5, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66333333-6633-4613-8613-131313131313', '66211111-6621-4611-8611-111111111111', 9.5, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66333333-6633-4613-8613-131313131313', '66222222-6622-4612-8612-121212121212', 9.5, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66344444-6634-4614-8614-141414141414', '66211111-6621-4611-8611-111111111111', 7.0, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66344444-6634-4614-8614-141414141414', '66222222-6622-4612-8612-121212121212', 7.0, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66355555-6635-4615-8615-151515151515', '66211111-6621-4611-8611-111111111111', 9.0, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66355555-6635-4615-8615-151515151515', '66222222-6622-4612-8612-121212121212', 9.0, true),
  -- J6: final but missing Poise on Star -> must not count.
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66366666-6636-4616-8616-161616161616', '66211111-6621-4611-8611-111111111111', 10.0, true),
  -- J7: complete but draft -> must not count.
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66377777-6637-4617-8617-171717171717', '66211111-6621-4611-8611-111111111111', 1.0, false),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66377777-6637-4617-8617-171717171717', '66222222-6622-4612-8612-121212121212', 1.0, false),
  -- J8 (inactive) and Admin: complete + final -> must not count.
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66388888-6638-4618-8618-181818181818', '66211111-6621-4611-8611-111111111111', 1.0, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66388888-6638-4618-8618-181818181818', '66222222-6622-4612-8612-121212121212', 1.0, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66399999-6639-4619-8619-191919191919', '66211111-6621-4611-8611-111111111111', 10.0, true),
  ('66666666-6666-4666-8666-666666666666', '66111111-6611-4611-8611-111111111111', '66399999-6639-4619-8619-191919191919', '66222222-6622-4612-8612-121212121212', 10.0, true);

-- Zebra: J1 (10,4) + J2 (10,4) -> wavg 8.0 each; top criterion 10.0.
insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value, is_final) values
  ('66666666-6666-4666-8666-666666666666', '66122222-6612-4612-8612-121212121212', '66311111-6631-4611-8611-111111111111', '66211111-6621-4611-8611-111111111111', 10.0, true),
  ('66666666-6666-4666-8666-666666666666', '66122222-6612-4612-8612-121212121212', '66311111-6631-4611-8611-111111111111', '66222222-6622-4612-8612-121212121212', 4.0, true),
  ('66666666-6666-4666-8666-666666666666', '66122222-6612-4612-8612-121212121212', '66322222-6632-4612-8612-121212121212', '66211111-6621-4611-8611-111111111111', 10.0, true),
  ('66666666-6666-4666-8666-666666666666', '66122222-6612-4612-8612-121212121212', '66322222-6632-4612-8612-121212121212', '66222222-6622-4612-8612-121212121212', 4.0, true);

-- Apple: J1 (8,8) + J2 (8,8) -> 8.00; top criterion 8.0 (loses the tie-break to Zebra).
insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value, is_final) values
  ('66666666-6666-4666-8666-666666666666', '66133333-6613-4613-8613-131313131313', '66311111-6631-4611-8611-111111111111', '66211111-6621-4611-8611-111111111111', 8.0, true),
  ('66666666-6666-4666-8666-666666666666', '66133333-6613-4613-8613-131313131313', '66311111-6631-4611-8611-111111111111', '66222222-6622-4612-8612-121212121212', 8.0, true),
  ('66666666-6666-4666-8666-666666666666', '66133333-6613-4613-8613-131313131313', '66322222-6632-4612-8612-121212121212', '66211111-6621-4611-8611-111111111111', 8.0, true),
  ('66666666-6666-4666-8666-666666666666', '66133333-6613-4613-8613-131313131313', '66322222-6632-4612-8612-121212121212', '66222222-6622-4612-8612-121212121212', 8.0, true);

-- Open AFTER seeding: the structure freeze forbids building into an open contest.
update public.contests set status = 'open'
  where id = '66666666-6666-4666-8666-666666666666';

-- @@NEXT@@
-- ── TEST 1: simple average + weights + eligibility (admin, trim off) ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADM__"}';
do $t$
declare
  r_star   record;
  r_zebra  record;
  r_apple  record;
  v_n      integer;
  v_cols   text[];
begin
  select count(*) into v_n from public.get_results('66666666-6666-4666-8666-666666666666');
  if v_n <> 3 then raise exception 'FAIL 1/8: admin sees % rows, expected 3', v_n; end if;

  select * into r_star from public.get_results('66666666-6666-4666-8666-666666666666') where name = 'Star';
  if r_star.final_score = 8.60 and r_star.judges_counted = 5 and r_star.top_criterion_avg = 8.8 and r_star.rank = 1 then
    raise notice 'PASS 1/8: Star = 8.60 (simple avg of 9.0/8.5/9.5/7.0/9.0), 5 judges, top 8.8, rank 1';
  else
    raise exception 'FAIL 1/8: Star wrong: score=% counted=% top=% rank=%', r_star.final_score, r_star.judges_counted, r_star.top_criterion_avg, r_star.rank;
  end if;

  select * into r_zebra from public.get_results('66666666-6666-4666-8666-666666666666') where name = 'Zebra';
  select * into r_apple from public.get_results('66666666-6666-4666-8666-666666666666') where name = 'Apple';
  if r_zebra.final_score = 8.00 and r_zebra.judges_counted = 2 and r_zebra.top_criterion_avg = 10.0 and r_zebra.rank = 2
     and r_apple.final_score = 8.00 and r_apple.judges_counted = 2 and r_apple.top_criterion_avg = 8.0 and r_apple.rank = 3 then
    raise notice 'PASS 1b/8: tie at 8.00 broken by top criterion (Zebra 10.0 rank 2, Apple 8.0 rank 3)';
  else
    raise exception 'FAIL 1b/8: tie-break wrong: Zebra(%/%/%) Apple(%/%/%)',
      r_zebra.final_score, r_zebra.top_criterion_avg, r_zebra.rank,
      r_apple.final_score, r_apple.top_criterion_avg, r_apple.rank;
  end if;

  -- No per-judge data may leak through the result columns.
  select array_agg(k order by k) into v_cols
  from jsonb_object_keys(row_to_json(r_star)::jsonb) as k;
  if v_cols = array['contestant_id','final_score','judges_counted','name','number','photo_url','rank','top_criterion_avg'] then
    raise notice 'PASS 1c/8: result exposes no per-judge columns';
  else
    raise exception 'FAIL 1c/8: unexpected result columns: %', v_cols;
  end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── enable trimmed average (allowed while open) ──
update public.contests set use_trimmed_average = true
  where id = '66666666-6666-4666-8666-666666666666';

-- @@NEXT@@
-- ── TEST 2: trimmed average (admin) ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADM__"}';
do $t$
declare v_score numeric;
begin
  select final_score into v_score from public.get_results('66666666-6666-4666-8666-666666666666') where name = 'Star';
  if v_score = 8.83 then
    raise notice 'PASS 2/8: Star trimmed = 8.83 (dropped 7.0 and 9.5)';
  else
    raise exception 'FAIL 2/8: Star trimmed = %, expected 8.83', v_score;
  end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 3: judge sees nothing before lock ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__J1__"}';
do $t$
declare v_n integer;
begin
  select count(*) into v_n from public.get_results('66666666-6666-4666-8666-666666666666');
  if v_n = 0 then raise notice 'PASS 3/8: judge gets no rows on an open contest';
  else raise exception 'FAIL 3/8: judge sees % rows before lock', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 4: anon is blocked (no EXECUTE on get_results) ──
begin;
set local role anon;
do $t$
begin
  perform public.get_results('66666666-6666-4666-8666-666666666666');
  raise exception 'FAIL 4/8: anon call succeeded';
exception when insufficient_privilege then
  raise notice 'PASS 4/8: anon blocked (42501, fail-closed)';
end $t$;
rollback;

-- @@NEXT@@
-- ── lock the contest (superuser) ──
update public.contests set status = 'locked'
  where id = '66666666-6666-4666-8666-666666666666';

-- @@NEXT@@
-- ── TEST 5: judge sees results after lock; admin still can ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__J1__"}';
do $t$
declare v_n integer; v_score numeric;
begin
  select count(*) into v_n from public.get_results('66666666-6666-4666-8666-666666666666');
  if v_n <> 3 then raise exception 'FAIL 5/8: judge sees % rows after lock, expected 3', v_n; end if;
  select final_score into v_score from public.get_results('66666666-6666-4666-8666-666666666666') where name = 'Star';
  if v_score = 8.83 then raise notice 'PASS 5/8: judge sees locked results (Star 8.83)';
  else raise exception 'FAIL 5/8: judge sees Star = %, expected 8.83', v_score; end if;
end $t$;
rollback;

-- @@NEXT@@
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADM__"}';
do $t$
declare v_n integer;
begin
  select count(*) into v_n from public.get_results('66666666-6666-4666-8666-666666666666');
  if v_n = 3 then raise notice 'PASS 5b/8: admin still sees results after lock';
  else raise exception 'FAIL 5b/8: admin sees % rows, expected 3', v_n; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── TEST 6: freeze holds even for admins (7 blocked ops) ──
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "__ADM__"}';
do $t$
declare v_ok integer := 0;
begin
  begin
    update public.contests set use_trimmed_average = false
      where id = '66666666-6666-4666-8666-666666666666';
    raise exception 'FAIL 6/8: trimmed flag flip allowed';
  exception when raise_exception then v_ok := v_ok + 1;
  end;

  begin
    update public.criteria set weight = 9.99
      where id = '66211111-6621-4611-8611-111111111111';
    raise exception 'FAIL 6/8: criteria update allowed';
  exception when raise_exception then v_ok := v_ok + 1;
  end;

  begin
    insert into public.criteria (contest_id, name, weight)
      values ('66666666-6666-4666-8666-666666666666', 'Late Entry', 1.00);
    raise exception 'FAIL 6/8: criteria insert allowed';
  exception when raise_exception then v_ok := v_ok + 1;
  end;

  begin
    delete from public.criteria
      where id = '66222222-6622-4612-8612-121212121212';
    raise exception 'FAIL 6/8: criteria delete allowed';
  exception when raise_exception then v_ok := v_ok + 1;
  end;

  begin
    insert into public.contestants (contest_id, name, number)
      values ('66666666-6666-4666-8666-666666666666', 'Late Entry', 99);
    raise exception 'FAIL 6/8: contestant insert allowed';
  exception when raise_exception then v_ok := v_ok + 1;
  end;

  begin
    update public.contestants set name = 'Renamed'
      where id = '66111111-6611-4611-8611-111111111111';
    raise exception 'FAIL 6/8: contestant update allowed';
  exception when raise_exception then v_ok := v_ok + 1;
  end;

  begin
    delete from public.contestants
      where id = '66133333-6613-4613-8613-131313131313';
    raise exception 'FAIL 6/8: contestant delete allowed';
  exception when raise_exception then v_ok := v_ok + 1;
  end;

  if v_ok = 7 then raise notice 'PASS 6/8: all 7 locked-contest mutations blocked';
  else raise exception 'FAIL 6/8: only % of 7 mutations blocked', v_ok; end if;
end $t$;
rollback;

-- @@NEXT@@
-- ── CLEANUP (superuser) ─────────────────────────────
-- Freeze triggers block child-row deletes on a locked contest, so
-- maintenance runs with them disabled, then re-enables. Explicit
-- scores → judges order avoids the scores_judge_fk NO ACTION trap.
alter table public.contestants disable trigger contestants_freeze_locked;
alter table public.criteria disable trigger criteria_freeze_locked;
alter table public.judges disable trigger judges_freeze_locked;
delete from public.scores where contest_id = '66666666-6666-4666-8666-666666666666';
delete from public.judges where contest_id = '66666666-6666-4666-8666-666666666666';
delete from public.contests where id = '66666666-6666-4666-8666-666666666666';
delete from public.score_history where contest_id = '66666666-6666-4666-8666-666666666666';
alter table public.contestants enable trigger contestants_freeze_locked;
alter table public.criteria enable trigger criteria_freeze_locked;
alter table public.judges enable trigger judges_freeze_locked;
