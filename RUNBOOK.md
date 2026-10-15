# CWPC Runbook — event-day operations

Keep this open on the admin laptop. Every procedure below was tested in
rehearsal (Step 8). Service key stays server-side; nothing here needs it
except where marked "SQL Editor" (runs as superuser, bypasses RLS).

## A judge cannot log in

1. Dashboard → check they have a judge row for THIS contest and
   `is_active` is true. Inactive = "Access revoked" page on purpose.
2. Check the email spelling on their judge row (Manage judges shows it
   after invite; older rows may have none — ask what address they typed).
3. Spam folder. School/corporate mail often quarantines the first message.
4. Manage judges → **Resend link** (max 3 per address per 10 min; it says
   so if throttled — wait, then resend).
5. Code fallback: the same email contains a **6-digit code**. On /login,
   "I have a 6-digit code" signs them in without any link.
6. Corporate scanners: our links land on a "Continue to CWPC" button, so
   scanners can't burn them. If the button says expired, resend.
7. Still stuck: sign them in on YOUR phone hotspot (rules out their
   network), or have them try Gmail instead of the school address.

## A judge submitted by accident (BEFORE lock only)

Judges can't unsubmit themselves. Run this in the Supabase SQL Editor
(superuser). It refuses on locked contests. Replace the 3 values.

```sql
do $$
declare
  v_contest uuid := 'PASTE-CONTEST-ID';
  v_judge   uuid := 'PASTE-JUDGE-ROW-ID';  -- judges.id, not the user id
  v_reason  text := 'Judge tapped submit early, confirmed by SMS';
  v_n       integer;
begin
  if (select status from public.contests where id = v_contest) = 'locked' then
    raise exception 'cannot reopen scores in a locked contest';
  end if;
  update public.scores set is_final = false, submitted_at = null
    where contest_id = v_contest and judge_id = v_judge and is_final = true;
  get diagnostics v_n = row_count;
  insert into public.score_reopen_log (contest_id, judge_id, reason)
    values (v_contest, v_judge, v_reason);
  raise notice 'reopened % score(s); reason recorded', v_n;
end $$;
```

Find IDs: `select id, name from public.judges where contest_id = '...';`
After running, the judge's sheet is editable again; ask them to re-submit
when done. The `score_reopen_log` row is your paper trail (admins can
read it; nobody can write it except this procedure).

## A judge was revoked by mistake (before lock)

Nothing is deleted on revoke — their scores sit untouched, just excluded
from results. Manage judges → **Reactivate**. Their progress restores
immediately. (After lock, revoke/reactivate is frozen entirely.)

## The dashboard stops updating

1. Look at the Live/Polling pill (top right). Green Live = realtime.
   Amber Polling = realtime down, auto-refresh every 30 s — numbers are
   at most 30 s stale, nothing is lost.
2. Press the browser refresh once.
3. Check https://status.supabase.com — a platform outage affects login
   and scoring too, not just the dashboard.
4. Scores are never lost when the dashboard stalls: judges' sheets keep
   their own Saved indicators. The leaderboard recomputes from the
   database on every refresh.

## Email stops arriving

1. Wait 2 minutes and check spam (both Gmail and school mail).
2. Supabase throttles auth mail per hour on lower plans — bursts of
   invites + links + resends can 429. The resend button reports
   throttling; pause inviting for a while, then continue.
3. If you set up custom SMTP (README): Resend dashboard → Logs shows
   bounces/blocks per address.
4. Fallback: the 6-digit code from ANY earlier email still works until
   used — judges already mailed once don't need a new email.

## The site is down during the event

1. Confirm: is it just you (wifi) or everyone (phone hotspot test)?
2. Check status.supabase.com and your Vercel dashboard.
3. Go to paper immediately — don't wait. Per judge, per contestant, per
   criterion, write the number + value (e.g. `#7 Beauty 8.5`). One sheet
   per judge, signed.
4. When the site returns: each judge logs in and enters their own paper
   scores (drafts autosave; submit when complete). If a judge already
   submitted before the outage, use the accidental-submit SQL above to
   reopen them first (only before lock).
5. If the site won't return before results are due: read the paper aloud
   as the provisional result, enter everything later, lock, and publish
   the locked leaderboard as final.

## Restoring from backup

1. Fresh Supabase project → apply `supabase/*.sql` in filename order.
2. `psql < backup` with the data dump (see README → Backups). Auth
   users are NOT restored (passwords can't be exported) — re-create the
   5 judge accounts + your admin in Authentication → Users, then
   re-attach judge rows with the same names.
3. Re-upload photos to `contestant-photos` (same paths as before if you
   kept them — photo URLs keep working).
4. Re-run the readiness checklist, re-open, and have judges confirm
   their sheets before locking again.
