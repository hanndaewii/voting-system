"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setTrimmed, openContestAction, deleteContestAction } from "./actions";

function Note({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return (
    <p
      className={`mt-2 rounded-lg px-4 py-2.5 text-sm ring-1 ${
        ok ? "bg-green-50 text-green-800 ring-green-200" : "bg-red-50 text-red-700 ring-red-200"
      }`}
    >
      {message}
    </p>
  );
}

export function TrimToggle({
  contestId,
  value,
  locked,
}: {
  contestId: string;
  value: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(true);
  return (
    <div>
      <label className={`flex cursor-pointer items-start gap-3 ${locked ? "opacity-60" : ""}`}>
        <input
          type="checkbox"
          checked={value}
          disabled={locked}
          onChange={async (e) => {
            const res = await setTrimmed(contestId, e.target.checked);
            setOk(res.ok);
            setMessage(res.message);
            if (res.ok) router.refresh();
          }}
          className="mt-1 h-5 w-5 accent-gold-600"
        />
        <span className="text-sm text-ink">
          <span className="font-medium">Trimmed average.</span> Drop each
          contestant&apos;s single highest and lowest judge score before
          averaging (needs at least 3 judges; otherwise a simple average is
          used). {locked ? "Frozen — the contest is locked." : "Editable until locked."}
        </span>
      </label>
      <Note ok={ok} message={message} />
    </div>
  );
}

export function OpenButton({
  contestId,
  isOpen,
  isLocked,
}: {
  contestId: string;
  isOpen: boolean;
  isLocked: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (isOpen || isLocked) return null;

  async function confirm() {
    setBusy(true);
    const res = await openContestAction(contestId);
    setBusy(false);
    if (res.ok) {
      setConfirming(false);
      router.refresh();
    } else {
      setMessage(res.message);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setConfirming(true);
        }}
        className="w-full rounded-xl bg-gold-600 px-4 py-4 text-lg font-medium text-white shadow-md transition hover:bg-gold-500 sm:w-auto sm:px-8"
      >
        Open for judging
      </button>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-display text-2xl text-ink">Open for judging?</h3>
            <p className="mt-2 text-sm text-ink/70">
              After opening, criteria, weights, and the contestant list can no
              longer be changed. Only names and photos stay editable.
            </p>
            {message && (
              <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                {message}
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl border border-gold-300 px-4 py-3 font-medium text-gold-700 transition hover:bg-gold-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirm}
                className="flex-1 rounded-xl bg-gold-600 px-4 py-3 font-medium text-white shadow-md transition hover:bg-gold-500 disabled:opacity-60"
              >
                {busy ? "Opening…" : "Open it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DeleteContest({
  contestId,
  contestName,
  isDraft,
}: {
  contestId: string;
  contestName: string;
  isDraft: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!isDraft) return null;

  async function confirm() {
    if (typed.trim() !== contestName) return;
    setBusy(true);
    const res = await deleteContestAction(contestId, typed.trim());
    setBusy(false);
    if (res.ok) {
      router.push("/admin/contests");
      router.refresh();
    } else {
      setMessage(res.message);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setTyped("");
          setConfirming(true);
        }}
        className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-100"
      >
        Delete draft contest
      </button>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-display text-2xl text-ink">Delete {contestName}?</h3>
            <p className="mt-2 text-sm text-ink/70">
              Only empty drafts can be deleted. Type the contest name to confirm.
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={contestName}
              autoComplete="off"
              className="mt-3 w-full rounded-xl border border-gold-200 bg-ivory px-4 py-3 text-ink focus:border-red-400 focus:ring-2 focus:ring-red-200 focus:outline-none"
            />
            {message && (
              <p className="mt-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                {message}
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl border border-gold-300 px-4 py-3 font-medium text-gold-700 transition hover:bg-gold-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || typed.trim() !== contestName}
                onClick={confirm}
                className="flex-1 rounded-xl bg-red-700 px-4 py-3 font-medium text-white shadow-md transition hover:bg-red-600 disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
