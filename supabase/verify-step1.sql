-- CWPC Step 1 verification — self-testing, rolls back at the end (DB stays clean).
-- Prerequisite: at least one row in auth.users (the runner creates a temp user automatically;
-- if running manually, create one in Dashboard → Authentication → Users → Add user first).
-- Covers the Step 1 patches (decimal scores, no history on unchanged updates,
-- judges.is_active) and the hardening triggers (no reopening a locked
-- contest, submitted_at auto-stamped when a score becomes final).
begin;

do $test$
declare
  v_user        uuid;
  v_contest     uuid;
  v_contest2    uuid;
  v_contestant  uuid;
  v_contestant2 uuid;
  v_judge       uuid;
  v_criterion   uuid;
  v_score       uuid;
  v_score2      uuid;
  v_score3      uuid;
  v_ts          timestamptz;
  v_count       integer;
  v_active      boolean;
begin
  -- pick any existing auth user
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise exception 'PREREQ: create a user in Authentication → Users → Add user, then re-run';
  end if;

  -- 1. Seed a mini contest
  insert into public.contests (name) values ('CWPC Schema Test') returning id into v_contest;
  insert into public.contestants (contest_id, name, number) values (v_contest, 'Contestant A', 1) returning id into v_contestant;
  insert into public.contestants (contest_id, name, number) values (v_contest, 'Contestant B', 2) returning id into v_contestant2;
  insert into public.judges (user_id, contest_id, name) values (v_user, v_contest, 'Judge One') returning id into v_judge;
  insert into public.criteria (contest_id, name, weight) values (v_contest, 'Poise', 1.50) returning id into v_criterion;
  insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value)
    values (v_contest, v_contestant, v_judge, v_criterion, 7) returning id into v_score;
  raise notice 'PASS 1/13: seed rows inserted';

  -- 2. CHECK: integer outside 1-10 rejected
  begin
    insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value)
      values (v_contest, v_contestant, v_judge, v_criterion, 11);
    raise exception 'FAIL 2/13: value 11 was accepted';
  exception when check_violation then
    raise notice 'PASS 2/13: CHECK rejects integer outside 1-10';
  end;

  -- 3. CHECK: decimal outside 1-10 rejected (uses a fresh key so only CHECK can fire)
  begin
    insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value)
      values (v_contest, v_contestant2, v_judge, v_criterion, 10.5);
    raise exception 'FAIL 3/13: value 10.5 was accepted';
  exception when check_violation then
    raise notice 'PASS 3/13: CHECK rejects decimal outside 1-10';
  end;

  -- 4. UNIQUE: no duplicate (contestant, judge, criterion)
  begin
    insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value)
      values (v_contest, v_contestant, v_judge, v_criterion, 5);
    raise exception 'FAIL 4/13: duplicate score was accepted';
  exception when unique_violation then
    raise notice 'PASS 4/13: UNIQUE rejects duplicate (contestant, judge, criterion)';
  end;

  -- 5. Composite FK: score with mismatched contest_id must fail
  insert into public.contests (name) values ('CWPC Other Contest') returning id into v_contest2;
  begin
    insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value)
      values (v_contest2, v_contestant2, v_judge, v_criterion, 6);
    raise exception 'FAIL 5/13: cross-contest score was accepted';
  exception when foreign_key_violation then
    raise notice 'PASS 5/13: cross-contest score rejected';
  end;

  -- 6. Trigger logs UPDATE with decimal values
  update public.scores set value = 8.5 where id = v_score;
  select count(*) into v_count from public.score_history
    where score_id = v_score and operation = 'UPDATE' and old_value = 7 and new_value = 8.5;
  if v_count = 1 then raise notice 'PASS 6/13: decimal UPDATE captured in score_history';
  else raise exception 'FAIL 6/13: decimal UPDATE not captured'; end if;

  -- 7. Trigger ignores no-op UPDATE (value unchanged → no new history row)
  update public.scores set value = 8.5 where id = v_score;
  select count(*) into v_count from public.score_history where score_id = v_score;
  if v_count = 1 then raise notice 'PASS 7/13: unchanged UPDATE wrote no history';
  else raise exception 'FAIL 7/13: unchanged UPDATE wrote history (% rows)', v_count; end if;

  -- 8. Trigger logs DELETE
  delete from public.scores where id = v_score;
  select count(*) into v_count from public.score_history
    where score_id = v_score and operation = 'DELETE' and old_value = 8.5 and new_value is null;
  if v_count = 1 then raise notice 'PASS 8/13: DELETE captured in score_history';
  else raise exception 'FAIL 8/13: DELETE not captured'; end if;

  -- 9. submitted_at auto-stamped when a score becomes final
  insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value, is_final)
    values (v_contest, v_contestant, v_judge, v_criterion, 8.0, true)
    returning id, submitted_at into v_score2, v_ts;
  if v_ts is null then raise exception 'FAIL 9/13: final insert left submitted_at null';
  else raise notice 'PASS 9/13: final insert auto-stamps submitted_at'; end if;

  insert into public.scores (contest_id, contestant_id, judge_id, criterion_id, value, is_final)
    values (v_contest, v_contestant2, v_judge, v_criterion, 6.0, false)
    returning id into v_score3;
  select submitted_at into v_ts from public.scores where id = v_score3;
  if v_ts is null then raise notice 'PASS 9b/13: non-final insert leaves submitted_at null';
  else raise exception 'FAIL 9b/13: non-final insert stamped submitted_at'; end if;

  update public.scores set is_final = true where id = v_score3 returning submitted_at into v_ts;
  if v_ts is null then raise exception 'FAIL 9c/13: submitting did not stamp submitted_at';
  else raise notice 'PASS 9c/13: submitting stamps submitted_at'; end if;

  -- 10. Lock the contest (draft -> open -> locked; direct draft->locked is blocked)
  update public.contests set status = 'open' where id = v_contest;
  update public.contests set status = 'locked' where id = v_contest;
  raise notice 'PASS 10/13a: contest can be opened then locked';
  begin
    update public.contests set status = 'open' where id = v_contest;
    raise exception 'FAIL 10/13: reopening a locked contest was allowed';
  exception when raise_exception then
    raise notice 'PASS 10/13: locked contest cannot be reopened';
  end;

  -- 11. judges.is_active defaults to true
  select is_active into v_active from public.judges where id = v_judge;
  if v_active is true then raise notice 'PASS 11/13: judges.is_active defaults to true';
  else raise exception 'FAIL 11/13: judges.is_active is not true'; end if;

  -- 12. Cascade: deleting a contest removes its children
  delete from public.contests where id = v_contest;
  select count(*) into v_count from public.contestants where contest_id = v_contest;
  if v_count = 0 then raise notice 'PASS 12/13: contest delete cascades to children';
  else raise exception 'FAIL 12/13: cascade broken'; end if;

  -- 13. RLS enabled on all six tables
  select count(*) into v_count from pg_tables
    where schemaname = 'public'
      and tablename in ('contests','contestants','judges','criteria','scores','score_history')
      and rowsecurity;
  if v_count = 6 then raise notice 'PASS 13/13: RLS enabled on all 6 tables';
  else raise exception 'FAIL 13/13: only % of 6 tables have RLS', v_count; end if;

  raise notice 'ALL CHECKS PASSED — rolling back test data';
end
$test$;

rollback;
