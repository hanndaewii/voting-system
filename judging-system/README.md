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
| `manifest.webmanifest` | PWA manifest (install to home screen).          |
| `sw.js`       | Service worker — caches the app shell for offline use; never caches API calls. |
| `icon.svg`, `icon-maskable.svg` | App icons (SVG, scale to any size).  |
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

| Timestamp            | Judge ID  | Contestant ID | Score | Notes                       |
| -------------------- | --------- | ------------- | ----- | --------------------------- |
| 2026-08-24 20:10:31  | JUDGE-01  | C001          | 85    | Strong opening, weak finish |
| 2026-08-24 20:11:04  | JUDGE-01  | C002          | 92    |                             |

The unique record is `Judge ID + Contestant ID`. Saving the same pair again
**updates** the existing row in place — it never creates a duplicate.

The `Notes` column (added in a later revision) stores each judge's optional
private note for that contestant (max 500 chars). Existing sheets without the
column get it added automatically on the next API call — old rows simply have
an empty note.

---

## Configuration (top of `Code.gs`)

```js
const JUDGE_PASSWORD      = 'CHANGE_THIS_BEFORE_DEPLOYMENT'; // shared secret
const ORGANIZER_PASSWORD  = 'CHANGE_THIS_ORGANIZER_KEY';     // organizer-only tools
const MIN_SCORE           = 1;
const MAX_SCORE            = 100;
const VOTING_OPEN          = true;   // server-enforced master switch
const SHOW_LIVE_RESULTS    = false;  // hide all results by default
const NOTE_MAX_LENGTH      = 500;    // max chars per judge note
```

`ORGANIZER_PASSWORD` gates the organizer-only endpoints (judge-notes review and
CSV roster import). It is intentionally separate from the judges' shared
password — organizers can already see everything in the Google Sheet itself, so
these endpoints do not expose anything the organizer could not see anyway, but
judges must not be able to call them.

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
   - Set `ORGANIZER_PASSWORD` to a key only you (the organizer) know — it
     unlocks the notes-review and roster-import tools in the Results tab.
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

Upload the whole folder — `index.html` plus the PWA files
(`manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-maskable.svg`):

- **Cloudflare Pages**: create a project, point it at the folder containing
  `index.html`, build command none, output directory `.`.
- **GitHub Pages**: push the folder to a repo, enable Pages in repo
  settings → Pages → Deploy from branch.

The service worker + manifest are optional enhancements — the app works
perfectly without them (they enable install-to-home-screen and offline
shell). `sw.js` never caches API responses, so scores are always fresh.

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
anonymized `judgesCompleted` counter (how many active judges have scored every
active contestant), and server time.

### `GET ?action=contestants`
Returns active contestants only.

### `GET ?action=myVotes&judgeId=...&password=...`
Authenticates the judge and returns `{ contestantId: score }` for that judge
only, plus the judge's current name from the sheet, plus a `timestamps` field
mapping `{ contestantId: "YYYY-MM-DD HH:MM:SS" }` for displaying "Updated 2m
ago" per card, plus a `notes` field mapping `{ contestantId: "note text" }`
(the judge's own private notes only).

### `GET ?action=judgeStats&judgeId=...&password=...`
Authenticates the judge and returns their personal aggregate stats:
`scored`, `total`, `remaining`, `average`, `highest`, `lowest`, `complete`,
`progressPct`, and `notesCount` (how many scored contestants have a note).
Never reveals other judges' data.

### `GET ?action=judgeNotes&organizerPassword=...`
**Organizer key required.** Returns every non-empty judge note, grouped by
contestant: `[{ contestantId, contestantName, entries: [{ judgeId, judgeName,
score, note, timestamp }] }]` plus a `totalNotes` counter. Used by the
organizer tools panel for post-voting deliberation.

### `GET ?action=results`
When `SHOW_LIVE_RESULTS = false` returns `{ ok:false, hidden:true }`. When
enabled, returns **aggregate totals** (`results`), a `breakdown` array sorted
by total desc with `rank`/`count`/`average` per contestant, plus anonymized
`judgesCompleted`/`activeJudges` counters. Never returns Judge IDs, per-judge
scores, or notes.

### `POST` (body = JSON, `Content-Type: text/plain;charset=utf-8`)

**`action: 'saveVote'`** — Body: `{ action, judgeId, contestantId, score,
password, note? }`. The optional `note` (string, ≤ 500 chars after trim) is
saved alongside the score. Omitting `note` **preserves** the stored note on
update; sending an empty string **clears** it. Validates in spec order, then
upserts the vote inside a `LockService.getScriptLock()`.

**`action: 'importRoster'`** — **Organizer key required.** Body:
`{ action, organizerPassword, csv }`. Batch-imports contestants and judges
from CSV text (one record per line, no header needed):

```
contestant,C010,Nina New,true
judge,JUDGE-10,Fourth Judge,true
contestant,C011,Retired Act,false
```

The `active` flag is optional (default `true`). Records are matched by ID:
existing rows are updated in place (name/active), new rows are appended,
identical rows are skipped. Invalid lines are reported individually in
`errors: [{ line, error }]` without aborting the valid ones. Returns counts
(`added`, `updated`, `skipped`, split by contestants/judges). Runs inside a
script lock.

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
- **Anonymous judges-progress** indicator — "X of Y judges finished scoring"
- **Score distribution mini-chart** — 5-quintile bar chart of the judge's own scores
- **Card collapse** — collapse scored cards to focus on remaining contestants
- **Organizer view** (Results tab or `#organizer` URL hash) — aggregate rankings
  table with medals, totals, averages, and ranks. Only populates when
  `SHOW_LIVE_RESULTS=true` on the backend; otherwise shows the "hidden" message.
- **Theme auto-detect** — respects `prefers-color-scheme` on first visit
- **Real-time auto-refresh** — polls status + myVotes every 30s; detects voting-open
  flips, new/removed contestants, and judge-name changes; toasts on voting flip
- **Sync indicator** — "Synced Xs ago" in the dashboard header, with a spinner while polling
- **Connection status dot** — green when online, red+blink when offline
- **Compare mode** (opt-in, `c`) — shows group averages on each card when
  `SHOW_LIVE_RESULTS=true`; disabled otherwise to avoid biasing active judging
- **Export results to CSV** (organizer, Results tab) — downloads the rankings table
- **Card density toggle** — Comfortable / Compact, persisted to localStorage
- **Organizer view refresh button** — re-fetch results without a full page reload
- **Contestant avatars** — colored initial circles with a deterministic hue per
  contestant ID (same contestant, same color everywhere); ring turns green when
  scored
- **Judge avatar chip** — initials avatar next to the judge name in the dashboard
  header (updates when the organizer edits the judge name)
- **Top picks** — medal chips (🥇🥈🥉) showing the judge's own top-3 highest
  scored contestants, updating live
- **Session timeout warning** — after 20 minutes of inactivity a countdown
  dialog appears; "Stay signed in" extends the session, otherwise the judge is
  signed out automatically (protects shared/kiosk devices)
- **Onboarding tour** — 6-step spotlight tour on first login (progress bar &
  stats, toolbar, score cards, tabs, shortcuts); replay anytime from the Export
  → "Restart guided tour" menu item
- **PWA support** — `manifest.webmanifest` + `sw.js`; the app shell installs to
  the home screen and opens offline (API calls always require the network so
  scores are never stale)
- **Password visibility toggle** on the login form
- **Animated stats** — count-up animation + pop when values change
- **Clear-filters button** in the empty search state
- **Themed scrollbars**, brand gradient, card left-edge status accents,
  `prefers-reduced-motion` support
- **Enter-to-save-and-next** — pressing Enter saves the focused card and jumps
  straight to the next unscored contestant's input (with a highlight ring), so a
  judge can score the entire roster without touching the mouse
- **Score position mini-bar** — a slim colored bar under each score input showing
  where the typed value sits within the valid range (red/amber/green gradient)
- **Organizer live results** — the Results tab auto-refreshes every 15s while
  visible, with a pulsing “LIVE · Xs ago” pill; re-entering the tab always fetches
  fresh data (no more stale rankings)
- **Copy results to clipboard** (organizer) — one click copies the rankings table
  as TSV, which pastes directly into Google Sheets or Excel
- **Stat tile tooltips** — hover hints explaining each stat on the dashboard strip
- **Judge notes** (per contestant) — each card has an "Add note" toggle that
  expands a private textarea (max 500 chars, live counter). Notes are saved
  with the score in one call, survive score-only updates, can be cleared with
  an empty save, and are included in CSV/JSON exports. The toggle turns amber
  with a "Note · saved" label and a two-line preview snippet; collapsed cards
  show a 📝 marker next to the score
- **Notes stat tile + filter** — the dashboard strip gains a 📝 Notes counter
  (click it or press `n` to filter to only noted contestants; also available as
  a "With notes" toolbar chip)
- **Note keyboard flow** — `Ctrl+Enter` inside the note field saves score +
  note; `Esc` reverts the text to the saved note and collapses the editor
- **Undo restores notes too** — the undo toast action reverts both the score
  and the note text of the last update
- **Organizer tools panel** (Results tab) — key-gated organizer area unlocked
  with `ORGANIZER_PASSWORD` (kept in sessionStorage per tab, re-verified on
  use, lockable with one click):
  - **Judge notes review** — every note across all judges, grouped by
    contestant in an accordion, each entry showing judge avatar/name, score
    chip, note text, and relative timestamp — built for post-voting
    deliberation
  - **CSV roster import** — paste `contestant,judge,ID,Name,active` lines to
    batch-add or update the roster; per-line error reporting; results and
    judge views refresh automatically after import

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
