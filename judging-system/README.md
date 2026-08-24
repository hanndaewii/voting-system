# JUDGED VOTE — Web-based Judging/Voting System

A complete, **dependency-free** judging/voting system for events with multiple
judges and multiple contestants.

- **Frontend**: a single `index.html` — vanilla JavaScript, no framework, no
  build step. Host it on Cloudflare Pages or GitHub Pages.
- **Backend**: a single `Code.gs` — Google Apps Script Web App. No servers, no
  paid services.
- **Database**: a Google Spreadsheet with three sheets (`Contestants`,
  `Judges`, `Votes`). The sheet is the source of truth.

---

## Architecture

```
Judge
  ↓  (browser)
Static Web App (index.html)
  ↓  (HTTPS GET/POST, JSON)
Google Apps Script Web App (Code.gs)
  ↓  (Apps Script services)
Google Sheets (Contestants / Judges / Votes)
```

The frontend is intentionally dumb: it only renders what the backend says and
never trusts its own state for authorization. The backend re-validates
everything on every request.

---

## Files

| File          | Purpose                                                  |
| ------------- | -------------------------------------------------------- |
| `Code.gs`     | Apps Script backend. All validation, locking, persistence. |
| `index.html`  | Static frontend. Login + judging dashboard.            |
| `README.md`   | This document.                                          |
| `test/`       | Node.js test harness that runs Code.gs against stubbed Apps Script services. |

---

## Google Sheet structure

The script **auto-creates** all three sheets on first run (or via the manual
`setupSheets()` function in the Apps Script editor). You do not need to create
them by hand.

### Sheet 1 — `Contestants`

| Contestant ID | Contestant Name  | Active |
| ------------- | ---------------- | ------ |
| C001          | Juan Dela Cruz   | TRUE   |
| C002          | Maria Santos     | TRUE   |
| C003          | Pedro Reyes     | FALSE  |

Only rows with `Active = TRUE` are returned to the judging page.

### Sheet 2 — `Judges`

| Judge ID  | Judge Name   | Active |
| --------- | ------------ | ------ |
| JUDGE-01  | Judge One    | TRUE   |
| JUDGE-02  | Judge Two    | TRUE   |
| JUDGE-03  | Judge Three  | FALSE  |

Only `Active = TRUE` judges can log in. **Editing the Judge Name does not
change the Judge ID or that judge's existing vote records** — votes are keyed to
Judge ID, and the displayed name is looked up fresh from the sheet on every
login/refresh.

### Sheet 3 — `Votes`

| Timestamp            | Judge ID  | Contestant ID | Score |
| -------------------- | --------- | ------------- | ----- |
| 2026-08-24 20:10:31  | JUDGE-01  | C001          | 85    |
| 2026-08-24 20:11:04  | JUDGE-01  | C002          | 92    |

The unique record is `Judge ID + Contestant ID`. Saving the same pair again
**updates** the existing row in place — it never creates a duplicate.

---

## Configuration (top of `Code.gs`)

```js
const JUDGE_PASSWORD      = 'CHANGE_THIS_BEFORE_DEPLOYMENT'; // shared secret
const MIN_SCORE           = 1;
const MAX_SCORE            = 100;
const VOTING_OPEN          = true;   // server-enforced master switch
const SHOW_LIVE_RESULTS    = false;  // hide all results by default
```

### Configuration in `index.html`

```js
const API_URL = 'PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE';
```

Replace that placeholder after deploying the Apps Script Web App.

---

## Deployment steps

### 1. Create the spreadsheet & Apps Script

1. Go to <https://sheets.google.com> and create a new spreadsheet (any name).
2. **Extensions → Apps Script**. This opens the Apps Script editor bound to the
   spreadsheet.
3. Delete the default `Code.gs` content and paste the contents of
   `Code.gs` from this project.
4. Edit the configuration block at the top:
   - Set `JUDGE_PASSWORD` to your real shared password.
   - Confirm `MIN_SCORE` / `MAX_SCORE`.
   - Set `VOTING_OPEN = true` while testing.
5. Click **Save project**. Name the project (e.g. `JudgedVote`).

### 2. (Optional) run `setupSheets()` once

In the Apps Script editor, pick `setupSheets` from the function dropdown and
click **Run**. This creates the three sheets with the correct headers and grants
the script the necessary authorization. (The API will also auto-create them on
first call, but running `setupSheets` is cleaner.)

### 3. Deploy as a Web App

1. Top right → **Deploy → New deployment**.
2. Select type: **Web app**.
3. Description: `JudgedVote v1`.
4. **Execute as:** *Me* (the account that owns the sheet).
5. **Who has access:** *Anyone* (required so judges can reach it without
   signing in to Google). If your organisation restricts "Anyone", use
   *Anyone with a Google account* — judges will need to sign in once.
6. Click **Deploy**. Authorize when prompted.
7. Copy the **Web app URL** that ends in `/exec`.

### 4. Point the frontend at the API

Open `index.html` and set:

```js
const API_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
```

### 5. Deploy `index.html` as a static site

- **Cloudflare Pages**: create a project, point it at the folder containing
  `index.html`, build command none, output directory `.`.
- **GitHub Pages**: push `index.html` to a repo, enable Pages in repo
  settings → Pages → Deploy from branch.

No build step. No dependencies. It just works.

### 6. Populate the sheet

- Add contestants to the `Contestants` sheet (`C001`, `Juan Dela Cruz`, `TRUE`).
- Add judges to the `Judges` sheet (`JUDGE-01`, `Judge One`, `TRUE`).

### 7. End-to-end test

1. Open the deployed `index.html` URL.
2. Log in as `JUDGE-01` with the password you set.
3. Score a few contestants, click **Save Score** / **Update Score**.
4. Confirm `✓ Saved` only appears after the server returns success.
5. Refresh the page (or close/reopen). Confirm your scores come back.
6. Change a judge's name in the `Judges` sheet, refresh the page, confirm the
   new name appears in the dashboard header.
7. Set `VOTING_OPEN = false` in `Code.gs`, save, then call the API directly
   with `curl` to confirm votes are still rejected server-side.

### 8. Launch

- Clear test data from the `Votes` sheet.
- Confirm `VOTING_OPEN = true`.
- Distribute the static site URL, the Judge IDs, and the shared password to
  your judges.

---

## API reference

All requests go to the single `/exec` URL.

### `GET ?action=status`
Public. Returns score range, voting-open flag, active judge/contestant counts,
and server time.

### `GET ?action=contestants`
Returns active contestants only.

### `GET ?action=myVotes&judgeId=...&password=...`
Authenticates the judge and returns `{ contestantId: score }` for that judge
only, plus the judge's current name from the sheet, plus a `timestamps` field
mapping `{ contestantId: "YYYY-MM-DD HH:MM:SS" }` for displaying "Updated 2m
ago" per card.

### `GET ?action=judgeStats&judgeId=...&password=...`
Authenticates the judge and returns their personal aggregate stats:
`scored`, `total`, `remaining`, `average`, `highest`, `lowest`, `complete`,
`progressPct`. Never reveals other judges' data.

### `GET ?action=results`
When `SHOW_LIVE_RESULTS = false` returns `{ ok:false, hidden:true }`. When
enabled, returns **aggregate totals only** — never Judge IDs or per-judge
scores.

### `POST` (body = JSON, `Content-Type: text/plain;charset=utf-8`)
Body: `{ action: 'saveVote', judgeId, contestantId, score, password }`.
Validates in spec order, then upserts the vote inside a
`LockService.getScriptLock()`.

---

## Frontend features

- **Login** with Judge ID + shared password (session-only credential storage)
- **Dashboard** with judge name from Google Sheets (fresh on every login/refresh)
- **Per-contestant cards** with individual Save/Update buttons and status badges
  (Not scored / Saving… / Saved / Updating… / Error)
- **Progress bar** + percentage, computed from server truth
- **Personal stats strip** — average, highest, lowest, remaining
- **Quick-score chips** — tap-to-fill preset scores derived from the configured
  range (mobile friendly)
- **Score heatmap** — input tints red/amber/green based on value position in range
- **Search** contestants by name or ID
- **Sort** by unscored-first / name / score ascending / score descending
- **Unscored-only filter** toggle
- **Save all pending** bulk action
- **Toast notifications** for save results
- **Completion celebration** (confetti) when every active contestant is scored
- **Unsaved-changes guard** — warns before logout/refresh when inputs differ
  from saved scores
- **Dark mode** toggle (persisted to localStorage)
- **Mobile-first responsive** design with safe-area insets and sticky footer
- **Export** menu — Print / PDF (clean print stylesheet), CSV, JSON of own scores
- **Keyboard shortcuts** overlay (press `?`): `/` search, `Esc` clear, `t` theme,
  `u` unscored-only, `r` refresh, `s` save focused card, `1-5` fill preset chip,
  arrow keys to step score
- **Undo last save** — toast action button reverts an update to the previous value
- **Auto-save** (opt-in) — 2s debounce after typing; only fires when value differs
- **Per-card relative timestamp** — "Updated 2m ago", auto-refreshes every 30s

---

## Security model

This is a **shared-secret** system, not per-user accounts. All active judges
share one password. The password exists only in `Code.gs`. The frontend never
contains it.

Everything security-relevant is enforced server-side:
- Judge authorization (active judge in the sheet)
- Judge identity (Judge ID lookup, votes keyed to Judge ID)
- Contestant authorization (active contestant)
- Score validity and range
- Voting-open status (server rejects even if a script bypasses the UI)
- Duplicate prevention (`LockService` + Judge ID + Contestant ID unique)

---

## Testing

The `test/` folder contains a Node.js test harness that loads `Code.gs`,
injects in-memory stubs of `SpreadsheetApp`, `LockService`, `ContentService`,
`Session`, and `Utilities`, and runs every test from the spec.

```bash
cd /home/z/my-project/judging-system/test
node run-tests.js
```

See `test/README.md` for details.
