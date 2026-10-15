"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveScore, submitScores } from "./actions";
import type { SubmitResult } from "./actions";

export interface Contestant {
  id: string;
  name: string;
  number: number;
  photo_url: string | null;
}

export interface Criterion {
  id: string;
  name: string;
  weight: number;
}

export interface ScoreEntry {
  contestant_id: string;
  criterion_id: string;
  value: number;
  is_final: boolean;
}

interface Props {
  userEmail: string;
  judgeId: string;
  contests: { id: string; name: string; status: string }[];
  contest: { id: string; name: string; status: string };
  contestants: Contestant[];
  criteria: Criterion[];
  initialScores: ScoreEntry[];
  initialSubmitted: boolean;
}

type RowState = { st: "idle" | "saving" | "saved" | "error"; msg?: string };

const key = (ct: string, cr: string) => `${ct}:${cr}`;
const RETRY_DELAYS = [2000, 5000, 15000];

// Definitive failures: retrying cannot help.
const NO_RETRY = /between 1 and 10|submitted|closed|not an active judge|frozen/i;
// Auth failures: need a fresh login, not a retry.
const AUTH_FAIL = /not signed in|session|expired|jwt|refresh|unauthorized|auth/i;

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function draftKey(contestId: string, judgeId: string) {
  return `cwpc-draft:${contestId}:${judgeId}`;
}

function readDrafts(contestId: string, judgeId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(draftKey(contestId, judgeId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export default function ScoreSheet({
  userEmail,
  judgeId,
  contests,
  contest,
  contestants,
  criteria,
  initialScores,
  initialSubmitted,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialScores.map((s) => [key(s.contestant_id, s.criterion_id), s.value]))
  );
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const retries = useRef<Record<string, number>>({});
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const isOpen = contest.status === "open";
  const readOnly = submitted || !isOpen;
  const returnTo = `/judge?contest=${contest.id}`;

  // Restore unsaved drafts (keys the server never confirmed) after mount.
  useEffect(() => {
    const serverKeys = new Set(
      initialScores.map((s) => key(s.contestant_id, s.criterion_id))
    );
    const local = readDrafts(contest.id, judgeId);
    const missing: Record<string, number> = {};
    for (const [k, v] of Object.entries(local)) {
      if (!serverKeys.has(k)) missing[k] = v;
    }
    if (Object.keys(missing).length > 0) {
      setValues((prev) => ({ ...prev, ...missing }));
      setRowState((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(missing)) next[k] = { st: "error", msg: "Restored unsaved change — saving…" };
        return next;
      });
      for (const k of Object.keys(missing)) {
        const [ctId, crId] = k.split(":");
        scheduleSave(k, ctId, crId, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist current values locally so a logout/crash loses nothing.
  useEffect(() => {
    if (submitted) return;
    try {
      localStorage.setItem(draftKey(contest.id, judgeId), JSON.stringify(values));
    } catch {
      // Storage full/blocked: server remains the source of truth.
    }
  }, [values, contest.id, judgeId, submitted]);

  // Warn before leaving with unsaved work.
  const pendingCount =
    Object.values(rowState).filter((r) => r.st === "saving" || r.st === "error").length;
  useEffect(() => {
    if (pendingCount === 0) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [pendingCount]);

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    []
  );

  async function attemptSave(k: string, ctId: string, crId: string) {
    const v = valuesRef.current[k];
    if (v === undefined || readOnly) return;
    setRowState((prev) => ({ ...prev, [k]: { st: "saving" } }));
    let res: { ok: boolean; message?: string };
    try {
      res = await saveScore({
        contestId: contest.id,
        contestantId: ctId,
        criterionId: crId,
        value: v,
      });
    } catch {
      res = { ok: false, message: "Network error — could not reach the server." };
    }
    if (res.ok) {
      retries.current[k] = 0;
      setRowState((prev) => ({ ...prev, [k]: { st: "saved" } }));
      return;
    }
    const msg = res.message ?? "Save failed.";
    if (AUTH_FAIL.test(msg)) {
      // Fresh login needed; values stay on screen + in localStorage.
      setRowState((prev) => ({ ...prev, [k]: { st: "error", msg: `${msg} Sign in again to continue.` } }));
      return;
    }
    if (NO_RETRY.test(msg)) {
      setRowState((prev) => ({ ...prev, [k]: { st: "error", msg } }));
      return;
    }
    const n = (retries.current[k] ?? 0) + 1;
    retries.current[k] = n;
    if (n <= RETRY_DELAYS.length) {
      setRowState((prev) => ({ ...prev, [k]: { st: "error", msg: `${msg} Retrying…` } }));
      timers.current[k] = setTimeout(() => void attemptSave(k, ctId, crId), RETRY_DELAYS[n - 1]);
    } else {
      setRowState((prev) => ({ ...prev, [k]: { st: "error", msg } }));
    }
  }

  function scheduleSave(k: string, ctId: string, crId: string, delay = 700) {
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => void attemptSave(k, ctId, crId), delay);
  }

  function retryAll() {
    for (const [k, rs] of Object.entries(rowState)) {
      if (rs.st !== "error") continue;
      const [ctId, crId] = k.split(":");
      retries.current[k] = 0;
      void attemptSave(k, ctId, crId);
    }
  }

  function handleChange(ctId: string, crId: string, raw: number) {
    if (readOnly || !Number.isFinite(raw)) return;
    const v = Math.min(10, Math.max(1, Math.round(raw * 2) / 2));
    const k = key(ctId, crId);
    retries.current[k] = 0;
    setValues((prev) => ({ ...prev, [k]: v }));
    setResult(null);
    scheduleSave(k, ctId, crId);
  }

  async function confirmSubmit() {
    setSubmitting(true);
    const res = await submitScores(contest.id);
    setSubmitting(false);
    setConfirming(false);
    setResult(res);
    if (res.ok) {
      setSubmitted(true);
      try {
        localStorage.removeItem(draftKey(contest.id, judgeId));
      } catch {
        // ignore
      }
      router.refresh();
    }
  }

  const statusOf = (ctId: string): "done" | "progress" | "todo" => {
    const got = criteria.filter((c) => values[key(ctId, c.id)] !== undefined).length;
    if (got === 0) return "todo";
    return got === criteria.length ? "done" : "progress";
  };
  const doneCount = contestants.filter((c) => statusOf(c.id) === "done").length;
  const savingCount = Object.values(rowState).filter((r) => r.st === "saving").length;
  const errorEntries = Object.entries(rowState).filter(([, r]) => r.st === "error");
  const authBlocked = errorEntries.some(([, r]) => AUTH_FAIL.test(r.msg ?? ""));

  const statusPill = (s: "done" | "progress" | "todo") =>
    s === "done" ? (
      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-green-800">
        Done
      </span>
    ) : s === "progress" ? (
      <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-gold-800">
        In progress
      </span>
    ) : (
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-600">
        Not started
      </span>
    );

  return (
    <div>
      {contests.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {contests.map((c) => (
            <a
              key={c.id}
              href={`/judge?contest=${c.id}`}
              className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
                c.id === contest.id
                  ? "bg-gold-600 text-white ring-gold-600"
                  : "bg-white text-gold-700 ring-gold-200 hover:bg-gold-50"
              }`}
            >
              {c.name}
            </a>
          ))}
        </div>
      )}

      {/* Progress */}
      <div className="rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">{contest.name}</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
              isOpen ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
            }`}
          >
            {contest.status}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="font-medium text-ink">
            {doneCount}/{contestants.length} contestants scored
          </span>
          {savingCount > 0 && <span className="text-gold-700">Saving…</span>}
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-gold-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600 transition-all"
            style={{
              width: contestants.length ? `${(doneCount / contestants.length) * 100}%` : "0%",
            }}
          />
        </div>
        {!isOpen && (
          <p className="mt-3 rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700">
            {contest.status === "locked"
              ? "This contest is locked. Scores are final and read-only."
              : "This contest is not open yet. Scoring is disabled."}
          </p>
        )}
        {submitted && (
          <p className="mt-3 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-800 ring-1 ring-green-200">
            Scores submitted — this sheet is now read-only.
          </p>
        )}
        {errorEntries.length > 0 && (
          <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            <p className="font-medium">
              {authBlocked
                ? "Not saved — your session expired. Your values are kept below."
                : "Not saved — reconnecting. Your values are kept below."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={retryAll}
                className="rounded-lg bg-red-700 px-3 py-2 text-xs font-medium text-white"
              >
                Retry now
              </button>
              {authBlocked && (
                <a
                  href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                  className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-300"
                >
                  Sign in again (keeps this page)
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contestants */}
      <div className="mt-4 space-y-3">
        {contestants.map((ct) => {
          const st = statusOf(ct.id);
          const open = expanded === ct.id;
          return (
            <div
              key={ct.id}
              className="overflow-hidden rounded-2xl bg-white shadow-xl shadow-gold-100 ring-1 ring-gold-100"
            >
              <button
                type="button"
                onClick={() => setExpanded(open ? null : ct.id)}
                className="flex w-full items-center gap-4 px-4 py-4 text-left"
                aria-expanded={open}
              >
                {ct.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ct.photo_url}
                    alt={ct.name}
                    className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-gold-200"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gold-100 font-display text-lg text-gold-800 ring-2 ring-gold-200">
                    {initials(ct.name)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-medium text-ink">
                    <span className="mr-2 rounded-md bg-ink px-2 py-0.5 text-sm text-white">
                      #{ct.number}
                    </span>
                    {ct.name}
                  </span>
                </span>
                {statusPill(st)}
                <span className="text-gold-500">{open ? "▾" : "▸"}</span>
              </button>

              {open && (
                <div className="space-y-5 border-t border-gold-100 px-4 py-5">
                  {criteria.map((cr) => {
                    const k = key(ct.id, cr.id);
                    const v = values[k];
                    const rs = rowState[k] ?? { st: "idle" as const };
                    return (
                      <div key={cr.id}>
                        <div className="flex items-baseline justify-between">
                          <label
                            htmlFor={`score-${k}`}
                            className="font-medium text-ink"
                          >
                            {cr.name}
                            <span className="ml-2 text-sm font-normal text-ink/50">
                              ×{cr.weight}
                            </span>
                          </label>
                          {rs.st === "saving" && (
                            <span className="animate-pulse text-xs text-gold-700">Saving…</span>
                          )}
                          {rs.st === "saved" && (
                            <span className="text-xs font-medium text-green-700">Saved ✓</span>
                          )}
                          {rs.st === "error" && (
                            <span className="text-xs font-medium text-red-700">Not saved</span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-4">
                          <input
                            type="range"
                            min={1}
                            max={10}
                            step={0.5}
                            value={v ?? 5}
                            disabled={readOnly}
                            onChange={(e) => handleChange(ct.id, cr.id, Number(e.target.value))}
                            aria-label={`${cr.name} score for ${ct.name}`}
                            className="h-3 min-h-[44px] flex-1 accent-gold-600 disabled:opacity-40"
                          />
                          <input
                            id={`score-${k}`}
                            type="number"
                            min={1}
                            max={10}
                            step={0.5}
                            value={v ?? ""}
                            placeholder="–"
                            disabled={readOnly}
                            onChange={(e) => handleChange(ct.id, cr.id, Number(e.target.value))}
                            className="w-20 rounded-xl border border-gold-200 bg-ivory px-3 py-3 text-center text-lg text-ink focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none disabled:opacity-40"
                          />
                        </div>
                        {rs.st === "error" && (
                          <p className="mt-1 text-xs text-red-700">{rs.msg}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {contestants.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-ink/60 ring-1 ring-gold-100">
            No contestants in this contest yet.
          </p>
        )}
      </div>

      {/* Submit */}
      <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100">
        {result && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm ring-1 ${
              result.ok
                ? "bg-green-50 text-green-800 ring-green-200"
                : "bg-red-50 text-red-700 ring-red-200"
            }`}
          >
            <p className="font-medium">{result.message}</p>
            {result.missing && result.missing.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {result.missing.map((m, i) => (
                  <li key={i}>
                    {m.contestant_name} — {m.criterion_name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button
          type="button"
          disabled={readOnly || submitting}
          onClick={() => setConfirming(true)}
          className="w-full rounded-xl bg-gold-600 px-4 py-4 text-lg font-medium text-white shadow-md transition hover:bg-gold-500 disabled:opacity-40"
        >
          {submitted ? "Scores submitted" : "Submit final scores"}
        </button>
        {!submitted && isOpen && (
          <p className="mt-2 text-center text-xs text-ink/50">
            Submits every score at once. Incomplete sheets are rejected with a list.
          </p>
        )}
      </div>

      {/* Confirm dialog */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-display text-2xl text-ink">Submit final scores?</h3>
            <p className="mt-2 text-sm text-ink/70">
              You cannot change scores after submitting.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl border border-gold-300 px-4 py-3 font-medium text-gold-700 transition hover:bg-gold-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={confirmSubmit}
                className="flex-1 rounded-xl bg-gold-600 px-4 py-3 font-medium text-white shadow-md transition hover:bg-gold-500 disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
