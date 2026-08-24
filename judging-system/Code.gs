/**
 * ============================================================
 * JUDGED VOTE — Google Apps Script backend (Code.gs)
 * ============================================================
 *
 * ARCHITECTURE:
 *   Judge  ->  Static Web App (index.html)  ->  Apps Script API  ->  Google Sheets
 *
 * SECURITY MODEL — READ THIS:
 *   This is a SHARED-SECRET system, NOT full individual account authentication.
 *   Every active judge shares the SAME password (JUDGE_PASSWORD below).
 *   The password is the only shared secret. A judge's identity is enforced by
 *   looking up their Judge ID in the "Judges" sheet and confirming it is active.
 *   This is adequate for a friendly/local judging event but is NOT a substitute
 *   for real per-user accounts. Do not deploy this for high-stakes public use.
 *
 * SOURCE OF TRUTH:
 *   The Google Spreadsheet is the authoritative database.
 *   Judge names, contestant names, active flags, and vote scores are ALL
 *   controlled by editing the sheet. The website only reads/displays/writes
 *   through this API.
 *
 * ============================================================
 * CONFIGURATION — edit these before deploying
 * ============================================================
 */

// SHARED secret password for all judges.
// IMPORTANT: replace before deployment. Only lives here in Code.gs.
const JUDGE_PASSWORD = 'CHANGE_THIS_BEFORE_DEPLOYMENT';

// Organizer key. Grants access to organizer-only endpoints (judge notes
// review, CSV roster import). The organizer can already see everything in
// the Google Sheet itself — this key just gates the web API surface.
const ORGANIZER_PASSWORD = 'CHANGE_THIS_ORGANIZER_KEY';

// Max characters for a per-contestant judge note.
const NOTE_MAX_LENGTH = 500;

// Score range. Easy to change later.
const MIN_SCORE = 1;
const MAX_SCORE = 100;

// Master switch for voting. When false, judges can log in and view their
// existing scores but cannot create or update scores. Enforced SERVER-SIDE.
const VOTING_OPEN = true;

// When false (default), the public results endpoint returns nothing.
// When true, only AGGREGATE totals are returned. Individual judge votes are
// NEVER exposed through the public API.
const SHOW_LIVE_RESULTS = false;

// Sheet names
const SHEET_CONTESTANTS = 'Contestants';
const SHEET_JUDGES = 'Judges';
const SHEET_VOTES = 'Votes';

// Header rows — must match the spec exactly
const CONTESTANT_HEADERS = ['Contestant ID', 'Contestant Name', 'Active'];
const JUDGE_HEADERS = ['Judge ID', 'Judge Name', 'Active'];
// 'Notes' (col 5) was added in a later revision. ensureSheet_ adds the column
// to existing sheets without touching data rows; old rows simply have '' there.
const VOTE_HEADERS = ['Timestamp', 'Judge ID', 'Contestant ID', 'Score', 'Notes'];

// Timestamp format
const TIMESTAMP_FORMAT = 'yyyy-MM-dd HH:mm:ss';

/**
 * ============================================================
 * ENTRY POINTS
 * ============================================================
 */

/**
 * GET handler. Action is chosen by ?action=...
 *  - contestants  -> list active contestants
 *  - myVotes      -> judge's own scores + notes (auth required)
 *  - judgeStats   -> judge's personal aggregates (auth required)
 *  - judgeNotes   -> all judge notes, organizer key required
 *  - results      -> aggregate results (only if SHOW_LIVE_RESULTS)
 *  - status       -> public status (voting open, score range)
 */
function doGet(e) {
  try {
    ensureSheetsExist_();
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || '';

    switch (action) {
      case 'contestants':
        return jsonOut_({ ok: true, contestants: getActiveContestants_() });

      case 'myVotes':
        return handleMyVotes_(params);

      case 'judgeStats':
        return handleJudgeStats_(params);

      case 'judgeNotes':
        return handleJudgeNotes_(params);

      case 'results':
        return handleResults_();

      case 'status':
        // Enriched with active judge/contestant counts, anonymized
        // judges-completed counter, and server time so the frontend can show
        // "X of Y judges finished" and sync clocks without extra calls.
        return jsonOut_({
          ok: true,
          votingOpen: VOTING_OPEN,
          minScore: MIN_SCORE,
          maxScore: MAX_SCORE,
          showLiveResults: SHOW_LIVE_RESULTS,
          activeJudges: countActiveJudges_(),
          activeContestants: getActiveContestants_().length,
          judgesCompleted: countJudgesCompleted_(),
          serverTime: formatNow_()
        });

      default:
        return jsonOut_({ ok: false, error: 'Unknown or missing action.' });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Server error: ' + safeErr_(err) });
  }
}

/**
 * POST handler. Body is JSON sent as text/plain to avoid CORS preflight.
 * saveVote validates in the exact order required by the spec:
 *   parse -> password -> judge id -> judge active -> contestant ->
 *   contestant active -> score numeric -> score range -> note length ->
 *   voting open -> lock -> find existing -> update or insert -> release lock.
 * importRoster is organizer-key gated and handles CSV batch import.
 */
function doPost(e) {
  try {
    ensureSheetsExist_();

    // 1. Parse JSON body
    var body = {};
    try {
      body = JSON.parse(e.postData.contents || '{}');
    } catch (parseErr) {
      return jsonOut_({ ok: false, error: 'Invalid JSON body.' });
    }

    var judgeId = str_(body.judgeId);
    var contestantId = str_(body.contestantId);
    var score = body.score;
    var password = str_(body.password);
    var action = str_(body.action || 'saveVote');

    if (action === 'importRoster') {
      return handleImportRoster_(body);
    }

    if (action !== 'saveVote') {
      return jsonOut_({ ok: false, error: 'Unknown action.' });
    }

    // 2. Validate password (shared secret)
    if (!password) {
      return jsonOut_({ ok: false, error: 'Missing password.' });
    }
    if (password !== JUDGE_PASSWORD) {
      return jsonOut_({ ok: false, error: 'Invalid password.' });
    }

    // 3. Validate Judge ID present
    if (!judgeId) {
      return jsonOut_({ ok: false, error: 'Missing Judge ID.' });
    }

    // 4. Validate judge exists and is active
    var judge = getActiveJudge_(judgeId);
    if (!judge) {
      return jsonOut_({ ok: false, error: 'Invalid or inactive Judge ID.' });
    }

    // 5. Validate contestant ID present
    if (!contestantId) {
      return jsonOut_({ ok: false, error: 'Missing Contestant ID.' });
    }

    // 6. Validate contestant exists and is active
    var contestant = getActiveContestant_(contestantId);
    if (!contestant) {
      return jsonOut_({ ok: false, error: 'Invalid or inactive Contestant ID.' });
    }

    // 7. Validate score is numeric
    if (score === null || score === undefined || score === '') {
      return jsonOut_({ ok: false, error: 'Missing score.' });
    }
    var numericScore = Number(score);
    if (!isFinite(numericScore)) {
      return jsonOut_({ ok: false, error: 'Score must be a number.' });
    }

    // 8. Validate score range
    if (numericScore < MIN_SCORE || numericScore > MAX_SCORE) {
      return jsonOut_({
        ok: false,
        error: 'Score must be between ' + MIN_SCORE + ' and ' + MAX_SCORE + '.'
      });
    }

    // 9. Voting must be open (server-enforced)
    if (!VOTING_OPEN) {
      return jsonOut_({ ok: false, error: 'Voting is closed.' });
    }

    // 9b. Optional note: string, trimmed, length-capped. When the field is
    // absent (undefined) the existing note is preserved on update; an empty
    // string explicitly CLEARS the note.
    var note = body.note;
    if (note !== undefined && note !== null) {
      note = str_(note);
      if (note.length > NOTE_MAX_LENGTH) {
        return jsonOut_({
          ok: false,
          error: 'Note must be ' + NOTE_MAX_LENGTH + ' characters or fewer.'
        });
      }
    } else {
      note = undefined; // preserve existing note on update
    }

    // 10. Lock + find/update or insert
    var lock = LockService.getScriptLock();
    var locked = false;
    try {
      locked = lock.tryLock(10000); // wait up to 10s
      if (!locked) {
        return jsonOut_({ ok: false, error: 'Server busy, please retry.' });
      }

      var result = upsertVote_(judgeId, contestantId, numericScore, note);
      return jsonOut_(result);
    } finally {
      if (locked) {
        try { lock.releaseLock(); } catch (releaseErr) { /* ignore */ }
      }
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Server error: ' + safeErr_(err) });
  }
}

/**
 * ============================================================
 * ACTION HANDLERS
 * ============================================================
 */

function handleMyVotes_(params) {
  var judgeId = str_(params.judgeId);
  var password = str_(params.password);

  if (!password) return jsonOut_({ ok: false, error: 'Missing password.' });
  if (password !== JUDGE_PASSWORD) return jsonOut_({ ok: false, error: 'Invalid password.' });
  if (!judgeId) return jsonOut_({ ok: false, error: 'Missing Judge ID.' });

  var judge = getActiveJudge_(judgeId);
  if (!judge) return jsonOut_({ ok: false, error: 'Invalid or inactive Judge ID.' });

  var votes = getJudgeVotes_(judgeId);
  var timestamps = getJudgeVoteTimestamps_(judgeId);
  var notes = getJudgeVoteNotes_(judgeId);
  return jsonOut_({
    ok: true,
    judgeName: judge.name,
    votes: votes,
    timestamps: timestamps,
    notes: notes
  });
}

/**
 * Personal aggregate stats for the logged-in judge. Computes scored/total,
 * average, highest, lowest, and the spread of their OWN scores only.
 * Never reveals other judges' scores or identities.
 */
function handleJudgeStats_(params) {
  var judgeId = str_(params.judgeId);
  var password = str_(params.password);

  if (!password) return jsonOut_({ ok: false, error: 'Missing password.' });
  if (password !== JUDGE_PASSWORD) return jsonOut_({ ok: false, error: 'Invalid password.' });
  if (!judgeId) return jsonOut_({ ok: false, error: 'Missing Judge ID.' });

  var judge = getActiveJudge_(judgeId);
  if (!judge) return jsonOut_({ ok: false, error: 'Invalid or inactive Judge ID.' });

  var votes = getJudgeVotes_(judgeId);
  var notes = getJudgeVoteNotes_(judgeId);
  var contestants = getActiveContestants_();
  var total = contestants.length;
  var scoredList = [];
  var notesCount = 0;
  for (var i = 0; i < contestants.length; i++) {
    var cid = contestants[i].id;
    if (votes[cid] !== undefined && votes[cid] !== null) {
      var n = Number(votes[cid]);
      if (isFinite(n)) scoredList.push(n);
      if (notes[cid]) notesCount++;
    }
  }
  var scored = scoredList.length;
  var sum = 0, highest = null, lowest = null;
  for (var j = 0; j < scoredList.length; j++) {
    var v = scoredList[j];
    sum += v;
    if (highest === null || v > highest) highest = v;
    if (lowest === null || v < lowest) lowest = v;
  }
  var average = scored > 0 ? Math.round((sum / scored) * 100) / 100 : null;
  var complete = total > 0 && scored === total;
  return jsonOut_({
    ok: true,
    judgeName: judge.name,
    total: total,
    scored: scored,
    remaining: Math.max(0, total - scored),
    average: average,
    highest: highest,
    lowest: lowest,
    complete: complete,
    notesCount: notesCount,
    progressPct: total > 0 ? Math.round((scored / total) * 100) : 0
  });
}

function handleResults_() {
  if (!SHOW_LIVE_RESULTS) {
    return jsonOut_({
      ok: false,
      hidden: true,
      error: 'Results are hidden until voting closes.'
    });
  }
  // Existing totals shape — kept for backward compatibility.
  var results = getAggregateResults_();
  // New: per-contestant breakdown with rank/count/average for the organizer
  // view. Still no Judge IDs or per-judge scores — only aggregates.
  var breakdown = getResultsBreakdown_();
  return jsonOut_({
    ok: true,
    results: results,
    breakdown: breakdown.list,
    judgesCompleted: breakdown.judgesCompleted,
    activeJudges: breakdown.activeJudges
  });
}

/**
 * ORGANIZER-ONLY: every judge note across all contestants, for post-voting
 * deliberation. Gated by ORGANIZER_PASSWORD (a key only the organizer holds —
 * they can already read the whole Google Sheet, so this endpoint does not
 * expose anything the organizer could not see anyway).
 * Returns notes grouped by contestant:
 *   [{ contestantId, contestantName, entries:
 *      [{ judgeId, judgeName, score, note, timestamp }] }]
 */
function handleJudgeNotes_(params) {
  var key = str_(params.organizerPassword);
  if (!key) return jsonOut_({ ok: false, error: 'Missing organizer key.' });
  if (key !== ORGANIZER_PASSWORD) {
    return jsonOut_({ ok: false, error: 'Invalid organizer key.' });
  }
  ensureSheetsExist_();
  var contestants = getActiveContestants_();
  var byId = {};
  for (var i = 0; i < contestants.length; i++) byId[contestants[i].id] = contestants[i];

  var sheet = getSpreadsheet_().getSheetByName(SHEET_VOTES);
  var out = [];
  var grouped = {};
  if (sheet && sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
    for (var r = 0; r < data.length; r++) {
      var row = data[r];
      var jid = str_(row[1]);
      var cid = str_(row[2]);
      var note = str_(row[4]);
      if (!jid || !cid || !note) continue; // only non-empty notes
      if (!grouped[cid]) {
        grouped[cid] = {
          contestantId: cid,
          contestantName: byId[cid] ? byId[cid].name : cid,
          entries: []
        };
      }
      var judge = getActiveJudge_(jid);
      var sc = Number(row[3]);
      grouped[cid].entries.push({
        judgeId: jid,
        judgeName: judge ? judge.name : jid,
        score: isFinite(sc) ? sc : str_(row[3]),
        note: note,
        timestamp: str_(row[0])
      });
    }
  }
  // Order groups by contestant roster order, then by name for unknown IDs
  out = contestants.filter(function(c) { return grouped[c.id]; })
    .map(function(c) { return grouped[c.id]; });
  Object.keys(grouped).forEach(function(cid) {
    if (!byId[cid]) out.push(grouped[cid]); // inactive contestants too
  });
  return jsonOut_({
    ok: true,
    notes: out,
    totalNotes: out.reduce(function(acc, g) { return acc + g.entries.length; }, 0)
  });
}

/**
 * ORGANIZER-ONLY: batch import of contestants and judges from CSV text.
 * Gated by ORGANIZER_PASSWORD. Upserts by ID — existing rows keep their
 * position and are updated in place (name/active); new rows are appended.
 *
 * CSV format (one record per line, comma-separated, no header):
 *   contestant,<Contestant ID>,<Contestant Name>,<active true/false>
 *   judge,<Judge ID>,<Judge Name>,<active true/false>
 * The active flag is optional and defaults to true.
 * Names must not contain commas (use the sheet directly for complex names).
 *
 * Returns { ok, added, updated, skipped, errors:[{line, error}] }.
 */
function handleImportRoster_(body) {
  var key = str_(body.organizerPassword);
  if (!key) return jsonOut_({ ok: false, error: 'Missing organizer key.' });
  if (key !== ORGANIZER_PASSWORD) {
    return jsonOut_({ ok: false, error: 'Invalid organizer key.' });
  }
  var csv = str_(body.csv || '');
  if (!csv) return jsonOut_({ ok: false, error: 'Missing CSV content.' });

  var lines = csv.split(/\r?\n/);
  var added = 0, updated = 0, skipped = 0;
  var errors = [];
  var pendingContestants = [];
  var pendingJudges = [];

  for (var i = 0; i < lines.length; i++) {
    var lineNo = i + 1;
    var line = str_(lines[i]);
    if (!line) continue; // ignore blank lines
    // A leading "type,..." header line is tolerated and skipped.
    if (lineNo === 1 && /^type\s*,/i.test(line)) continue;
    var parts = line.split(',');
    if (parts.length < 3 || parts.length > 4) {
      errors.push({ line: lineNo, error: 'Expected 3 or 4 comma-separated fields, got ' + parts.length + '.' });
      continue;
    }
    var type = str_(parts[0]).toLowerCase();
    var id = str_(parts[1]);
    var name = str_(parts[2]);
    // Empty/missing active field defaults to true (e.g. trailing comma).
    var active = (parts.length >= 4 && str_(parts[3]) !== '') ? parseBool_(parts[3]) : true;
    if (type !== 'contestant' && type !== 'judge') {
      errors.push({ line: lineNo, error: 'Unknown type "' + str_(parts[0]) + '" — use contestant or judge.' });
      continue;
    }
    if (!id) {
      errors.push({ line: lineNo, error: 'Missing ID.' });
      continue;
    }
    if (!name) {
      errors.push({ line: lineNo, error: 'Missing name.' });
      continue;
    }
    if (id.indexOf(',') !== -1) {
      errors.push({ line: lineNo, error: 'IDs must not contain commas.' });
      continue;
    }
    var rec = { id: id, name: name, active: active };
    if (type === 'contestant') pendingContestants.push(rec);
    else pendingJudges.push(rec);
  }

  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    locked = lock.tryLock(10000);
    if (!locked) {
      return jsonOut_({ ok: false, error: 'Server busy, please retry.' });
    }
    var resC = upsertRosterRows_(SHEET_CONTESTANTS, CONTESTANT_HEADERS, pendingContestants);
    var resJ = upsertRosterRows_(SHEET_JUDGES, JUDGE_HEADERS, pendingJudges);
    added = resC.added + resJ.added;
    updated = resC.updated + resJ.updated;
    skipped = resC.skipped + resJ.skipped;
    return jsonOut_({
      ok: true,
      added: added,
      updated: updated,
      skipped: skipped,
      contestantsAdded: resC.added,
      contestantsUpdated: resC.updated,
      judgesAdded: resJ.added,
      judgesUpdated: resJ.updated,
      errors: errors
    });
  } finally {
    if (locked) {
      try { lock.releaseLock(); } catch (releaseErr) { /* ignore */ }
    }
  }
}

/**
 * Upsert a batch of roster rows into the given sheet. Rows are matched by ID
 * (col 1). Existing rows are updated in place (name + active); missing rows
 * are appended. Rows whose name AND active flag already match are counted as
 * skipped. MUST be called inside a script lock.
 */
function upsertRosterRows_(sheetName, headers, records) {
  var result = { added: 0, updated: 0, skipped: 0 };
  if (!records.length) return result;
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  var last = sheet.getLastRow();
  var existing = [];
  if (last >= 2) {
    var data = sheet.getRange(2, 1, last - 1, 3).getValues();
    for (var i = 0; i < data.length; i++) existing.push(data[i]);
  }
  for (var r = 0; r < records.length; r++) {
    var rec = records[r];
    var rowIdx = -1;
    for (var e = 0; e < existing.length; e++) {
      if (str_(existing[e][0]) === rec.id) { rowIdx = e; break; }
    }
    if (rowIdx === -1) {
      sheet.appendRow([rec.id, rec.name, rec.active]);
      existing.push([rec.id, rec.name, rec.active]);
      result.added++;
    } else {
      var curName = str_(existing[rowIdx][1]);
      var curActive = parseBool_(existing[rowIdx][2]);
      if (curName === rec.name && curActive === rec.active) {
        result.skipped++;
      } else {
        sheet.getRange(rowIdx + 2, 1, 1, 3).setValues([[rec.id, rec.name, rec.active]]);
        existing[rowIdx] = [rec.id, rec.name, rec.active];
        result.updated++;
      }
    }
  }
  return result;
}

/**
 * ============================================================
 * SHEET MANAGEMENT
 * ============================================================
 */

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Auto-create the three sheets with the correct headers if they don't exist.
 * Does NOT wipe existing data.
 */
function ensureSheetsExist_() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, SHEET_CONTESTANTS, CONTESTANT_HEADERS);
  ensureSheet_(ss, SHEET_JUDGES, JUDGE_HEADERS);
  ensureSheet_(ss, SHEET_VOTES, VOTE_HEADERS);
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  var existing = headerRange.getValues()[0];
  var needsHeaders = false;
  for (var i = 0; i < headers.length; i++) {
    if (existing[i] !== headers[i]) { needsHeaders = true; break; }
  }
  if (sheet.getLastRow() === 0 || needsHeaders) {
    headerRange.setValues([headers]);
    try {
      headerRange.setFontWeight('bold');
    } catch (fmtErr) { /* ignore formatting errors */ }
  }
}

/**
 * ============================================================
 * CONTESTANTS
 * ============================================================
 */

function getActiveContestants_() {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_CONTESTANTS);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var data = sheet.getRange(2, 1, last - 1, 3).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id = str_(row[0]);
    var name = str_(row[1]);
    var active = parseBool_(row[2]);
    if (id && active) {
      out.push({ id: id, name: name });
    }
  }
  return out;
}

function getActiveContestant_(id) {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_CONTESTANTS);
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var data = sheet.getRange(2, 1, last - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    if (str_(data[i][0]) === id) {
      var active = parseBool_(data[i][2]);
      if (active) return { id: id, name: str_(data[i][1]) };
      return null;
    }
  }
  return null;
}

/**
 * ============================================================
 * JUDGES
 * ============================================================
 */

function getActiveJudge_(id) {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_JUDGES);
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var data = sheet.getRange(2, 1, last - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    if (str_(data[i][0]) === id) {
      var active = parseBool_(data[i][2]);
      if (active) return { id: id, name: str_(data[i][1]) };
      return null;
    }
  }
  return null;
}

/**
 * Count active judges. Used by the public status endpoint so the frontend
 * can display "X active judges" without exposing who they are.
 */
function countActiveJudges_() {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_JUDGES);
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var data = sheet.getRange(2, 1, last - 1, 3).getValues();
  var count = 0;
  for (var i = 0; i < data.length; i++) {
    if (str_(data[i][0]) && parseBool_(data[i][2])) count++;
  }
  return count;
}

/**
 * ============================================================
 * VOTES
 * ============================================================
 */

/**
 * Returns { contestantId: score } for the given judge only.
 * Never returns another judge's votes.
 */
function getJudgeVotes_(judgeId) {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_VOTES);
  var last = sheet.getLastRow();
  var votes = {};
  if (last < 2) return votes;
  var data = sheet.getRange(2, 1, last - 1, 4).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var jid = str_(row[1]);
    var cid = str_(row[2]);
    if (jid === judgeId && cid) {
      var sc = Number(row[3]);
      votes[cid] = isFinite(sc) ? sc : str_(row[3]);
    }
  }
  return votes;
}

/**
 * Returns { contestantId: timestamp-string } for the given judge only.
 * Used by the frontend to show "Updated 2m ago" per card.
 * Backward-compatible addition — does not change the existing votes field.
 */
function getJudgeVoteTimestamps_(judgeId) {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_VOTES);
  var last = sheet.getLastRow();
  var ts = {};
  if (last < 2) return ts;
  var data = sheet.getRange(2, 1, last - 1, 4).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var jid = str_(row[1]);
    var cid = str_(row[2]);
    if (jid === judgeId && cid) {
      ts[cid] = str_(row[0]);
    }
  }
  return ts;
}

/**
 * Returns { contestantId: note-string } for the given judge only.
 * Backward-compatible addition — old sheets without the Notes column simply
 * return empty strings for every row.
 */
function getJudgeVoteNotes_(judgeId) {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_VOTES);
  var last = sheet.getLastRow();
  var notes = {};
  if (last < 2) return notes;
  var data = sheet.getRange(2, 1, last - 1, 5).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var jid = str_(row[1]);
    var cid = str_(row[2]);
    if (jid === judgeId && cid) {
      notes[cid] = str_(row[4]);
    }
  }
  return notes;
}

/**
 * Upsert a vote. MUST be called inside a LockService.getScriptLock().
 * Finds existing record matching Judge ID + Contestant ID.
 * If found, UPDATE in place (keeps the row, updates timestamp + score).
 * If not found, INSERT a new row.
 * `note` semantics: undefined → preserve the existing note on update;
 * a string (including '') → write it (empty string clears the note).
 * Returns { ok:true, action:'updated'|'inserted', contestantId, score, judgeName, note }.
 */
function upsertVote_(judgeId, contestantId, score, note) {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_VOTES);
  var last = sheet.getLastRow();
  var updateRow = -1;

  if (last >= 2) {
    // Read Judge ID (col 2) and Contestant ID (col 3) for all data rows.
    var data = sheet.getRange(2, 1, last - 1, 5).getValues();
    for (var i = 0; i < data.length; i++) {
      if (str_(data[i][1]) === judgeId && str_(data[i][2]) === contestantId) {
        updateRow = i + 2; // +2 because data starts at row 2 and i is 0-based
        // Score-only update: keep whatever note is already stored.
        if (note === undefined) note = str_(data[i][4]);
        break;
      }
    }
  }

  var timestamp = formatNow_();
  if (note === undefined || note === null) note = '';

  if (updateRow > 0) {
    // UPDATE existing record in place. Preserves row position, no duplicate.
    sheet.getRange(updateRow, 1, 1, 5).setValues([[timestamp, judgeId, contestantId, score, note]]);
    var judge = getActiveJudge_(judgeId);
    return {
      ok: true,
      action: 'updated',
      contestantId: contestantId,
      score: score,
      timestamp: timestamp,
      judgeName: judge ? judge.name : '',
      note: note
    };
  } else {
    // INSERT new record
    sheet.appendRow([timestamp, judgeId, contestantId, score, note]);
    var judge2 = getActiveJudge_(judgeId);
    return {
      ok: true,
      action: 'inserted',
      contestantId: contestantId,
      score: score,
      timestamp: timestamp,
      judgeName: judge2 ? judge2.name : '',
      note: note
    };
  }
}

/**
 * Aggregate results. Returns { contestantId: totalScore }.
 * Sums all votes per contestant. Does NOT expose judge IDs or per-judge scores.
 */
function getAggregateResults_() {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_VOTES);
  var last = sheet.getLastRow();
  var totals = {};
  if (last < 2) return totals;
  var data = sheet.getRange(2, 1, last - 1, 4).getValues();
  for (var i = 0; i < data.length; i++) {
    var cid = str_(data[i][2]);
    var sc = Number(data[i][3]);
    if (cid && isFinite(sc)) {
      totals[cid] = (totals[cid] || 0) + sc;
    }
  }
  return totals;
}

/**
 * Returns an array of per-contestant aggregate stats sorted by total desc,
 * with rank, count of judges who scored, average, and the contestant name.
 * Used by the organizer view. Never includes Judge IDs.
 */
function getResultsBreakdown_() {
  var contestants = getActiveContestants_();
  var sheet = getSpreadsheet_().getSheetByName(SHEET_VOTES);
  var sums = {}, counts = {};
  if (sheet && sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    for (var i = 0; i < data.length; i++) {
      var cid = str_(data[i][2]);
      var sc = Number(data[i][3]);
      if (cid && isFinite(sc)) {
        sums[cid] = (sums[cid] || 0) + sc;
        counts[cid] = (counts[cid] || 0) + 1;
      }
    }
  }
  var list = contestants.map(function(c) {
    var t = sums[c.id] || 0;
    var n = counts[c.id] || 0;
    return {
      contestantId: c.id,
      name: c.name,
      total: t,
      count: n,
      average: n > 0 ? Math.round((t / n) * 100) / 100 : null
    };
  });
  // Rank by total desc (ties share the same ordinal rank)
  list.sort(function(a, b) { return (b.total || 0) - (a.total || 0); });
  var rank = 0, prev = null;
  for (var j = 0; j < list.length; j++) {
    if (prev === null || list[j].total !== prev) {
      rank = j + 1;
    }
    list[j].rank = rank;
    prev = list[j].total;
  }
  return {
    list: list,
    judgesCompleted: countJudgesCompleted_(),
    activeJudges: countActiveJudges_()
  };
}

/**
 * Anonymized count of active judges who have scored every active contestant.
 * Used by the public status endpoint so judges can see overall progress
 * without revealing which judges are done.
 */
function countJudgesCompleted_() {
  var judges = getActiveJudgeIds_();
  var contestants = getActiveContestants_();
  if (!judges.length || !contestants.length) return 0;
  var sheet = getSpreadsheet_().getSheetByName(SHEET_VOTES);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  // Build per-judge set of contestant IDs scored
  var byJudge = {};
  for (var i = 0; i < data.length; i++) {
    var jid = str_(data[i][1]);
    var cid = str_(data[i][2]);
    if (jid && cid) {
      if (!byJudge[jid]) byJudge[jid] = {};
      byJudge[jid][cid] = true;
    }
  }
  var completed = 0;
  for (var j = 0; j < judges.length; j++) {
    var set = byJudge[judges[j]] || {};
    var ok = true;
    for (var k = 0; k < contestants.length; k++) {
      if (!set[contestants[k].id]) { ok = false; break; }
    }
    if (ok) completed++;
  }
  return completed;
}

/**
 * Returns the Judge IDs of all active judges. Used internally for the
 * judges-completed calculation. Never exposed through a public endpoint.
 */
function getActiveJudgeIds_() {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_JUDGES);
  var last = sheet.getLastRow();
  var ids = [];
  if (last < 2) return ids;
  var data = sheet.getRange(2, 1, last - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    if (str_(data[i][0]) && parseBool_(data[i][2])) ids.push(str_(data[i][0]));
  }
  return ids;
}

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function str_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function parseBool_(v) {
  if (v === true || v === false) return v;
  if (v === null || v === undefined) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 't';
}

function safeErr_(err) {
  if (!err) return 'unknown';
  if (err.message) return err.message;
  return String(err);
}

function formatNow_() {
  try {
    var tz = Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'UTC';
    return Utilities.formatDate(new Date(), tz, TIMESTAMP_FORMAT);
  } catch (e) {
    // Fallback: manual ISO-ish timestamp
    return manualTimestamp_(new Date());
  }
}

function manualTimestamp_(d) {
  function pad(n) { n = String(n); while (n.length < 2) n = '0' + n; return n; }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

/**
 * Manual setup helper. Run once from the Apps Script editor to confirm
 * sheets were created. Optional — the API also auto-creates them on first call.
 */
function setupSheets() {
  ensureSheetsExist_();
  return 'Sheets ready.';
}
