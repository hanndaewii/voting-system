-- ════════════════════════════════════════════════════════════════
-- CWPC Step 8: audit + operational tables (safe to re-run)
-- 1. contestant_edit_log: name/photo changes while a contest is OPEN
--    (who, when, old, new). Written only by trigger; admin-read-only.
-- 2. magic_link_resends: resend audit + rate-limit source for the admin
--    resend action (max 3 per email per 10 min, enforced app-side).
--    Admin-read-only; inserts happen service-side.
-- 3. score_reopen_log: written by the superuser "unsubmit by accident"
--    procedure from the runbook (never by clients). Admin-read-only.
-- 4. otp_rate_limit: login/code request counters for the rate-limited
--    server actions. RLS on, zero client policies (service-side only).
-- ════════════════════════════════════════════════════════════════

-- ── 1. Contestant edit audit ────────────────────────────────────
create table if not exists public.contestant_edit_log (
  id             bigint       generated always as identity primary key,
  contest_id     uuid         not null,
  contestant_id  uuid         not null,
  changed_by     uuid         references auth.users (id) on delete set null,
  changed_at     timestamptz  not null default now(),
  old_name       text,
  new_name       text,
  old_photo_url  text,
  new_photo_url  text
);

create index if not exists contestant_edit_log_contest_time_idx
  on public.contestant_edit_log (contest_id, changed_at);

alter table public.contestant_edit_log enable row level security;

drop policy if exists contestant_edit_log_admin_read on public.contestant_edit_log;
create policy contestant_edit_log_admin_read on public.contestant_edit_log
  for select using (public.is_admin_of(contest_id));

create or replace function public.log_contestant_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Drafts change freely (no audit); locked rows can't change at all.
  if public.contest_status_of(new.contest_id) = 'open'
     and (old.name is distinct from new.name
          or old.photo_url is distinct from new.photo_url) then
    insert into public.contestant_edit_log
      (contest_id, contestant_id, changed_by,
       old_name, new_name, old_photo_url, new_photo_url)
    values
      (new.contest_id, new.id, auth.uid(),
       old.name, new.name, old.photo_url, new.photo_url);
  end if;
  return null;  -- AFTER trigger: return value is ignored
end;
$$;

drop trigger if exists contestants_edit_log on public.contestants;
create trigger contestants_edit_log
  after update on public.contestants
  for each row
  execute function public.log_contestant_edit();

revoke execute on function public.log_contestant_edit() from public, anon, authenticated;

-- ── 2. Magic-link resend log ────────────────────────────────────
create table if not exists public.magic_link_resends (
  id          bigint       generated always as identity primary key,
  contest_id  uuid         not null,
  email       text         not null,
  created_by  uuid         references auth.users (id) on delete set null,
  created_at  timestamptz  not null default now()
);

create index if not exists magic_link_resends_email_time_idx
  on public.magic_link_resends (email, created_at);

alter table public.magic_link_resends enable row level security;

drop policy if exists magic_link_resends_admin_read on public.magic_link_resends;
create policy magic_link_resends_admin_read on public.magic_link_resends
  for select using (public.is_admin_of(contest_id));

-- ── 3. Score reopen log (runbook procedure writes this) ─────────
create table if not exists public.score_reopen_log (
  id           bigint       generated always as identity primary key,
  contest_id   uuid         not null,
  judge_id     uuid         not null,
  reason       text         not null,
  reopened_by  text         not null default current_user,
  created_at   timestamptz  not null default now()
);

create index if not exists score_reopen_log_contest_time_idx
  on public.score_reopen_log (contest_id, created_at);

alter table public.score_reopen_log enable row level security;

drop policy if exists score_reopen_log_admin_read on public.score_reopen_log;
create policy score_reopen_log_admin_read on public.score_reopen_log
  for select using (public.is_admin_of(contest_id));

-- ── 4. OTP rate-limit counters (service-side only, deny all) ────
create table if not exists public.otp_rate_limit (
  id          bigint       generated always as identity primary key,
  email       text         not null,
  ip          text         not null default '',
  created_at  timestamptz  not null default now()
);

create index if not exists otp_rate_limit_email_time_idx
  on public.otp_rate_limit (email, created_at);
create index if not exists otp_rate_limit_ip_time_idx
  on public.otp_rate_limit (ip, created_at);

alter table public.otp_rate_limit enable row level security;
-- Intentionally zero policies: only the service role touches this table.

-- ── Step 8 follow-up: invited email on judges rows (for resends) ──
alter table public.judges add column if not exists email text;
