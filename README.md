# CWPC — Judge Scoring System

Beauty-contest scoring: 5 judges score every contestant independently.
Judges can't see each other's scores until lock. Admins manage everything
and lock the results. Final = average of judges' weighted scores, with an
optional trimmed average (drop highest + lowest).

Stack: Next.js (App Router) + TypeScript + Tailwind · Supabase (Postgres,
Auth, Realtime, Storage). Luxury gold/white theme.

## Project layout

```
app/                  Next.js routes: login, judge, admin, contests, results
lib/                  Supabase clients, roles, photo URLs
supabase/             Migrations, in order: schema, policies, submit,
                      ranking, admin, management, hardening (+ verify-*.sql)
RUNBOOK.md            Event-day operations
JUDGE-GUIDE.md        One-page judge instructions
ADMIN-GUIDE.md        One-page admin instructions
```

## Local setup

1. `npm install`
2. Copy keys into `.env.local` (git-ignored, never commit):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service key>   # server-only, never NEXT_PUBLIC_
   ```
3. Apply the SQL files in `supabase/` **in filename order**
   (`schema` → `policies` → `submit` → `ranking` → `admin` →
   `management` → `hardening`) via the Supabase SQL Editor, once each.
   Every file is re-runnable.
4. `npm run dev` → http://localhost:3000/login
5. First admin is seeded by hand in SQL (see Step 3 notes / RUNBOOK).

## Email templates (Auth → Email Templates)

Supabase sends the magic link. Two things matter:

1. **Redirect URL** must be `https://YOUR-DOMAIN/auth/callback`
   (add it under Auth → URL Configuration → Redirect URLs; keep
   `http://localhost:3000/auth/callback` only for local dev).
2. **Magic Link template must include the 6-digit code.** Judges whose
   one-time link gets used up (email scanners!) sign in by typing the
   code on /login instead. Keep this line in the template body:
   ```
   Your login code is: {{ .Token }}
   ```
   (`{{ .Token }}` is the 6-digit code; `{{ .ConfirmationURL }}` is the
   button link. Both come from the same email — see Supabase docs
   "Email templates".)

Invite emails (sent by the admin dashboard) redirect to `/auth/callback`
the same way.

## Recomputing the ranking in a spreadsheet

Download both CSVs from a locked contest's setup page. To check the math
yourself (per contestant):

1. Per judge: `=SUMPRODUCT(values_range, weights_range)/SUM(weights_range)`
   using only that judge's FINAL scores. A judge counts only with a final
   score in EVERY criterion; drafts, inactive judges and admins don't count.
2. Across judges: `=AVERAGE(judge_scores)`. If the ranking CSV says
   `method=trimmed` and 3+ judges counted:
   `=(SUM(j)-MAX(j)-MIN(j))/(COUNT(j)-2)`, else plain `AVERAGE`.
3. Round to 2 decimals. Ties break by best single-criterion average,
   then name. The repo's `recompute.js` used in rehearsal does exactly
   this with integer math — see Step 8 notes.

## Deploy to Vercel (recommended)

Vercel fits because this is a standard Next.js app: zero-config builds,
per-env secrets, preview deployments. Anything that hosts Node + env vars
works, but only Vercel needs no extra setup.

1. Push this folder to a Git repo (GitHub/GitLab). `.gitignore` already
   excludes `.env.local`, `node_modules`, `.next`.
2. Vercel → Add New → Project → Import the repo. Framework: Next.js.
3. Environment Variables (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = service key (**server-only**: plain
     env var, never `NEXT_PUBLIC_`; it only loads in server code —
     verified absent from client bundles in Step 8).
4. Deploy. Open the site URL, e.g. `https://cwpc.vercel.app`.
5. Supabase Dashboard → Authentication → URL Configuration:
   - Site URL → `https://cwpc.vercel.app`
   - Redirect URLs → add `https://cwpc.vercel.app/auth/callback`
   - Remove any `localhost` URLs from production (keep them only while
     developing locally).
6. HTTPS is automatic on Vercel. Test a real magic-link login on your
   phone before the event.

## Email delivery (custom SMTP)

The default Supabase sender is a shared pool: low hourly limits, no
reputation control, and contest mail is exactly the kind that gets
throttled or spam-foldered on event day. Use your own sender (Resend):

1. Resend → Domains → Add your domain (e.g. `mail.yourschool.edu`).
2. Add the shown SPF (`v=spf1 include:amazonses.com ~all` style TXT),
   DKIM (3 CNAMEs) and DMARC records at your DNS host. Wait for
   "Verified" in Resend.
3. Supabase → Project Settings → Auth → SMTP Settings → Enable custom
   SMTP: host `smtp.resend.com:465`, user `resend`, password = Resend API
   key, sender address `CWPC Judging <judging@yourschool.edu>`.
4. Test: invite `youraddress@gmail.com` and a Yahoo address from the
   dashboard. Confirm arrival in < 2 min AND check the spam folder on
   both. If Gmail flags it, fix SPF/DKIM before the event — not during.

## Backups

Free-plan facts that matter (verify yours in Dashboard → Settings →
Usage/Billing — plans change): **no point-in-time recovery**, and
projects **pause after ~7 days without activity**. A paused project
wakes on first request but takes ~1–2 min — unacceptable mid-event.

- Keep it awake the event week: open the dashboard daily, or hit the
  site once a day. Consider the $25/mo Pro plan for the event month
  (no pausing + daily backups + higher email/realtime limits).
- **Backup before opening** and **right after locking**:
  ```bash
  # schema + data (run from any machine with network + psql; %20 = space)
  pg_dump "postgresql://postgres.<ref>:<PASSWORD-URL-ENCODED>@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres" \
    --schema-only -f cwpc-schema.sql
  pg_dump "postgresql://postgres.<ref>:<PASSWORD-URL-ENCODED>@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres" \
    --data-only --exclude-table-data=auth.* -f cwpc-data.sql
  # photos: list + download everything under contestant-photos via the
  # Storage API (or Dashboard → Storage → bucket → download)
  ```
- Restore: fresh project → apply SQL files in order → `psql < backup`
  (data only) → re-upload photos → re-create auth users (passwords can't
  be restored; judges re-login by magic link anyway).

## Plan limits that matter (load-tested figures)

Measured on this project (5 judges × 100 contestants × 5 criteria):
2500 autosaves in ~11 s (232/s), 0 errors, p50 ≈ 300 ms / p95 ≈ 660 ms,
Realtime 2500/2500 delivered. Comfortable headroom on any plan.

Watch on event day (Dashboard → Usage): **Realtime concurrent
connections + messages** (one channel per open dashboard/judge page),
**database connections** (pooler absorbs bursts; direct connections are
scarce), **auth email rate** (invites + magic links + resends — the
tightest free-tier limit), **database size** (scores are tiny; photos
dominate — 5 MB cap each). If invites/resends start 429-ing, wait out
the hourly window (see RUNBOOK "email stops arriving").
