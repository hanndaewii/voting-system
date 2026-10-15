# Admin Guide — running a contest with CWPC (one page)

## Order of operations

**Draft → set up → open → judges score → lock → publish.**
You can't go backwards, so do things in this order.

1. **Contests → Create contest.** It starts as a draft, with you as admin.
2. **Setup page:** add contestants (single or paste-a-list), upload
   photos, add criteria + weights (percentages shown), invite judges by
   email. Watch the **readiness checklist** at the top.
3. **Settings:** trimmed average drops each contestant's highest and
   lowest judge score (needs 3+ judges). Leave off unless you want it.
4. **Open for judging** when ready. After opening you can still fix
   names and photos — but NOT criteria, weights, numbers, or the lineup.
5. **Lock** when scoring ends. Locking is permanent: scores, judges and
   settings freeze, and judges can finally see results.
6. **Results page:** print, or download the ranking + scores CSVs.

## Reading the dashboard

- Cards: live average and counts update as judges work (drafts count).
- Leaderboard: final scores only — judges can't see this until lock.
- Judge progress: `18/20 scored`, averages, submitted ticks, ≥9 counts,
  Active/Revoked. **Resend link** if someone can't get in (3 per
  10 min per address, then it throttles — say so and retry later).
- **Revoke** removes a judge's scores from results (nothing is deleted;
  reactivate to restore). Never available for admins or after lock.

## Locking rules of thumb

- The lock dialog lists judges who haven't submitted **by name** — chase
  them first. You can still lock with holdouts; their missing scores
  simply don't count.
- After lock: no edits, no revokes, no new judges, no setting changes.
  If results look wrong after lock, they stay wrong — check BEFORE.
- Take a backup right before opening and right after locking (README →
  Backups). Keep the project awake the event week (open the site daily).

## When things break

Open RUNBOOK.md and follow the scenario. The two you'll actually use:
accidental early submit (one SQL script, only before lock) and
revoke-by-mistake (just Reactivate). For everything else — login
trouble, email delays, site down — the runbook has the order: check,
resend/code fallback, paper backup.
