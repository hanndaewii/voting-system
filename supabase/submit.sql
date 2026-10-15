-- ════════════════════════════════════════════════════════════════
-- CWPC Step 4: atomic final-submit function (safe to re-run)
-- SECURITY INVOKER (the default, stated explicitly): every query inside
-- runs as the caller, so all Step-2 RLS policies still apply. The judge
-- is derived from auth.uid() — there is no judge parameter to forge.
-- The whole body is one transaction: completeness check + finalize.
-- ════════════════════════════════════════════════════════════════
create or replace function public.submit_final_scores(p_contest uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_judge_id  uuid;
  v_missing   jsonb;
  v_finalized integer;
begin
  -- Caller must be an active, non-admin judge of this contest.
  v_judge_id := public.my_judge_id(p_contest);
  if v_judge_id is null then
    raise exception 'not an active judge of this contest' using errcode = '42501';
  end if;

  -- Contest must be open (also enforced by the UPDATE policy below).
  if public.contest_status_of(p_contest) <> 'open' then
    raise exception 'contest is not open' using errcode = '42501';
  end if;

  -- A contest with nothing to score cannot be submitted.
  if not exists (select 1 from public.contestants where contest_id = p_contest)
     or not exists (select 1 from public.criteria where contest_id = p_contest) then
    raise exception 'contest has no contestants or criteria' using errcode = '42501';
  end if;

  -- Every (contestant, criterion) needs this judge's score.
  select coalesce(jsonb_agg(m), '[]'::jsonb) into v_missing
  from (
    select ct.name as contestant_name, cr.name as criterion_name
    from public.contestants ct
    cross join public.criteria cr
    left join public.scores s
      on s.contestant_id = ct.id
     and s.criterion_id = cr.id
     and s.judge_id = v_judge_id
    where ct.contest_id = p_contest
      and cr.contest_id = p_contest
      and s.id is null
    order by ct.name, cr.name
  ) m;

  if jsonb_array_length(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'missing', v_missing);
  end if;

  -- All-or-nothing finalize. submitted_at is stamped by the trigger.
  update public.scores
    set is_final = true
    where judge_id = v_judge_id
      and contest_id = p_contest
      and is_final = false;
  get diagnostics v_finalized = row_count;

  return jsonb_build_object('ok', true, 'finalized', v_finalized);
end;
$$;

-- Execute: authenticated only (revoking from public covers anon too).
revoke all on function public.submit_final_scores(uuid) from public, anon;
grant execute on function public.submit_final_scores(uuid) to authenticated;
