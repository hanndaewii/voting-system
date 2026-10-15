"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { lockContest } from "./actions";

export default function LockButton({
  contestId,
  contestName,
  unsubmitted,
}: {
  contestId: string;
  contestName: string;
  unsubmitted: string[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function confirm() {
    if (typed !== "LOCK") return;
    setBusy(true);
    const res = await lockContest(contestId);
    setBusy(false);
    if (res.ok) {
      setConfirming(false);
      setTyped("");
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
        className="w-full rounded-xl bg-ink px-4 py-4 text-lg font-medium text-white shadow-md transition hover:bg-black disabled:opacity-40 sm:w-auto sm:px-8"
      >
        Lock contest
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-display text-2xl text-ink">
              Lock {contestName}?
            </h3>
            <p className="mt-2 text-sm text-ink/70">
              Locking freezes all scores, judges and settings. Results become
              final and visible. This cannot be undone.
            </p>
            {unsubmitted.length > 0 ? (
              <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
                <p className="font-medium">Not yet submitted:</p>
                <ul className="mt-1 list-disc pl-5">
                  {unsubmitted.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">
                Every judge has submitted.
              </p>
            )}
            <label htmlFor="lock-confirm" className="mt-4 block text-sm font-medium text-ink">
              Type LOCK to confirm
            </label>
            <input
              id="lock-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="LOCK"
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-gold-200 bg-ivory px-4 py-3 text-lg tracking-widest text-ink focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none"
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
                disabled={busy || typed !== "LOCK"}
                onClick={confirm}
                className="flex-1 rounded-xl bg-ink px-4 py-3 font-medium text-white shadow-md transition hover:bg-black disabled:opacity-40"
              >
                {busy ? "Locking…" : "Lock it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
