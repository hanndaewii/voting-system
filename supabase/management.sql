-- ════════════════════════════════════════════════════════════════
-- CWPC Step 7: contest management (safe to re-run)
-- 1. create_contest(): any existing active admin can spin up a new draft
--    contest and becomes its admin, atomically.
-- 2. Structure freeze extended to OPEN contests: criteria and the
--    contestant list/numbers/weights are immutable once open (names and
--    photos stay editable while open, frozen when locked).
-- 3. Status transitions restricted to draft->open and open->locked.
-- 4. open_contest(): validates readiness, rejects with a missing list,
--    warns (not errors) when the active judge count is not 5.
-- 5. Draft deletion is governed by RLS (see policies.sql): admins may
--    delete scoreless drafts; open/locked rows are never deletable API-side.
-- 6. Private "contestant-photos" bucket + path-scoped storage policies.
--    Object path: <contest_id>/<contestant_id>/<random-uuid>.<ext>.
-- ════════════════════════════════════════════════════════════════

-- ── Membership helper scoped to one contest ─────────────────────
create or replace function public.is_admin_of(p_contest uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.judges j
    where j.user_id = auth.uid()
      and j.contest_id = p_contest
      and j.is_admin
      and j.is_active
  );
$$;

revoke all on function public.is_admin_of(uuid) from public, anon;
grant execute on function public.is_admin_of(uuid) to authenticated;

-- ── Freeze: now covers OPEN structure + status transitions ───────
create or replace function public.freeze_locked_contest()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_status public.contest_status;
  v_new_status public.contest_status;
  v_locked     boolean;
  v_open       boolean;
begin
  if TG_TABLE_NAME = 'contests' then
    -- Only installed as BEFORE UPDATE.
    if old.status = 'locked'
       and new.use_trimmed_average is distinct from old.use_trimmed_average then
      raise exception 'locked contest settings cannot be changed';
    end if;
    -- Allowed transitions: draft->open, open->locked (and no-ops).
    if old.status = 'draft' and new.status not in ('draft', 'open') then
      raise exception 'invalid status transition: draft can only open';
    elsif old.status = 'open' and new.status not in ('open', 'locked') then
      raise exception 'invalid status transition: open can only lock';
    elsif old.status = 'locked' and new.status <> 'locked' then
      raise exception 'invalid status transition: locked is final';
    end if;
    return new;
  end if;

  if TG_TABLE_NAME = 'judges' then
    -- Locked-only freeze (unchanged from Step 6).
    if TG_OP = 'DELETE' then
      select (c.status = 'locked') into v_locked
      from public.contests c where c.id = old.contest_id;
    elsif TG_OP = 'INSERT' then
      select (c.status = 'locked') into v_locked
      from public.contests c where c.id = new.contest_id;
    else
      select exists (
        select 1 from public.contests c
        where c.id in (old.contest_id, new.contest_id)
          and c.status = 'locked'
      ) into v_locked;
    end if;

    if coalesce(v_locked, false) then
      if TG_OP = 'INSERT' then
        if coalesce(new.is_admin, false) then
          return new;  -- adding admins never changes results
        end if;
        raise exception 'judge rows cannot be added to a locked contest';
      elsif TG_OP = 'DELETE' then
        if coalesce(old.is_admin, false) then
          return old;  -- removing admins never changes results
        end if;
        raise exception 'judges in a locked contest cannot be removed';
      else
        if coalesce(old.is_admin, false) and coalesce(new.is_admin, false) then
          return new;  -- admin rows staying admin remain manageable
        end if;
        raise exception 'judges in a locked contest cannot be modified';
      end if;
    end if;

    if TG_OP = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;

  -- criteria + contestants: resolve the contest status on each side.
  if TG_OP = 'DELETE' then
    select c.status into v_old_status
    from public.contests c where c.id = old.contest_id;
  elsif TG_OP = 'INSERT' then
    select c.status into v_new_status
    from public.contests c where c.id = new.contest_id;
  else
    select c.status into v_old_status
    from public.contests c where c.id = old.contest_id;
    select c.status into v_new_status
    from public.contests c where c.id = new.contest_id;
  end if;

  v_locked := coalesce(v_old_status = 'locked', false)
           or coalesce(v_new_status = 'locked', false);
  v_open   := coalesce(v_old_status = 'open', false)
           or coalesce(v_new_status = 'open', false);

  if TG_TABLE_NAME = 'criteria' then
    -- Weights, names, membership: immutable once open.
    if v_locked or v_open then
      raise exception 'criteria in an open or locked contest cannot be modified';
    end if;
  else -- contestants
    if v_locked then
      raise exception 'contestants in a locked contest cannot be modified';
    elsif v_open then
      if TG_OP = 'INSERT' then
        raise exception 'contestants cannot be added once the contest is open';
      elsif TG_OP = 'DELETE' then
        raise exception 'contestants cannot be removed once the contest is open';
      else
        if old.contest_id is distinct from new.contest_id then
          raise exception 'contestants cannot be moved once the contest is open';
        end if;
        if old.number is distinct from new.number then
          raise exception 'contestant numbers cannot change once the contest is open';
        end if;
        return new;  -- name + photo_url stay editable while open
      end if;
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

-- privileges persist across CREATE OR REPLACE; restated for clarity
revoke execute on function public.freeze_locked_contest() from public, anon, authenticated;

-- ── create_contest ──────────────────────────────────────────────
-- Any existing active admin (of any contest) may create a draft and
-- becomes its admin. The two inserts are one transaction: no orphan
-- contests, no admin-less contests. (The very first admin is seeded
-- by hand in SQL — this function cannot bootstrap from zero.)
create or replace function public.create_contest(p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid;
  v_admin_name text;
  v_id         uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'only existing admins can create contests' using errcode = '42501';
  end if;

  select j.name into v_admin_name
  from public.judges j
  where j.user_id = v_uid and j.is_admin and j.is_active
  order by j.created_at
  limit 1;
  if not found then
    raise exception 'only existing admins can create contests' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'contest name is required';
  end if;

  insert into public.contests (name, status)
    values (trim(p_name), 'draft')
    returning id into v_id;
  insert into public.judges (user_id, contest_id, name, is_admin)
    values (v_uid, v_id, v_admin_name, true);

  return v_id;
end;
$$;

revoke all on function public.create_contest(text) from public, anon;
grant execute on function public.create_contest(text) to authenticated;

-- ── open_contest ────────────────────────────────────────────────
-- Validates readiness, then opens. Missing pieces reject with a list;
-- a non-5 judge count only warns. (Status trigger enforces draft->open.)
create or replace function public.open_contest(p_contest_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid;
  v_status  public.contest_status;
  v_judges  integer;
  v_missing text[] := '{}';
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'admins only' using errcode = '42501';
  end if;

  perform 1 from public.judges j
  where j.user_id = v_uid
    and j.contest_id = p_contest_id
    and j.is_admin
    and j.is_active;
  if not found then
    raise exception 'admins only' using errcode = '42501';
  end if;

  select c.status into v_status
  from public.contests c where c.id = p_contest_id;
  if v_status is distinct from 'draft' then
    raise exception 'only draft contests can be opened';
  end if;

  if not exists (select 1 from public.criteria where contest_id = p_contest_id) then
    v_missing := array_append(v_missing, 'at least 1 criterion');
  end if;
  if not exists (select 1 from public.contestants where contest_id = p_contest_id) then
    v_missing := array_append(v_missing, 'at least 1 contestant');
  end if;
  select count(*)::integer into v_judges
  from public.judges
  where contest_id = p_contest_id and is_active and not is_admin;
  if v_judges = 0 then
    v_missing := array_append(v_missing, 'at least 1 active judge');
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'cannot open contest: %', array_to_string(v_missing, '; ');
  end if;

  update public.contests set status = 'open' where id = p_contest_id;

  if v_judges <> 5 then
    return jsonb_build_object(
      'ok', true,
      'warning', format('active judge count is %s, expected 5', v_judges)
    );
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.open_contest(uuid) from public, anon;
grant execute on function public.open_contest(uuid) to authenticated;

-- ── Storage: private contestant-photos bucket ───────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contestant-photos', 'contestant-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Admins of the path's contest may upload while draft/open. The random
-- filename (app-side) plus upsert:false means no overwrites.
drop policy if exists "contestant-photos admin insert" on storage.objects;
create policy "contestant-photos admin insert" on storage.objects
  for insert with check (
    bucket_id = 'contestant-photos'
    and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
    and public.is_admin_of((storage.foldername(name))[1]::uuid)
    and public.contest_status_of((storage.foldername(name))[1]::uuid) in ('draft', 'open')
  );

-- Admins may remove photos while draft/open. No UPDATE policy exists.
drop policy if exists "contestant-photos admin delete" on storage.objects;
create policy "contestant-photos admin delete" on storage.objects
  for delete using (
    bucket_id = 'contestant-photos'
    and public.is_admin_of((storage.foldername(name))[1]::uuid)
    and public.contest_status_of((storage.foldername(name))[1]::uuid) in ('draft', 'open')
  );

-- Active judges and admins of the path's contest may view. No anon.
drop policy if exists "contestant-photos read" on storage.objects;
create policy "contestant-photos read" on storage.objects
  for select using (
    bucket_id = 'contestant-photos'
    and (
      public.is_admin_of((storage.foldername(name))[1]::uuid)
      or public.my_judge_id((storage.foldername(name))[1]::uuid) is not null
    )
  );
