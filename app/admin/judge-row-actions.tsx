"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleJudgeActive } from "./actions";

export default function JudgeRowActions({
  judgeId,
  name,
  isActive,
  isAdmin,
  isLocked,
  isSelf,
}: {
  judgeId: string;
  name: string;
  isActive: boolean;
  isAdmin: boolean;
  isLocked: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (isAdmin) {
    return <span className="text-xs text-ink/40">Admin — managed out-of-band</span>;
  }

  async function confirm() {
    setBusy(true);
    const res = await toggleJudgeActive(judgeId, !isActive);
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
        disabled={isLocked}
        title={isLocked ? "Frozen — contest is locked" : isActive ? "Revoke judge" : "Reactivate judge"}
        onClick={() => {
          setMessage("");
          setConfirming(true);
        }}
        className={`rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-40 ${
          isActive
            ? "bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100"
            : "bg-green-50 text-green-800 ring-1 ring-green-200 hover:bg-green-100"
        }`}
      >
        {isActive ? "Revoke" : "Reactivate"}
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-display text-2xl text-ink">
              {isActive ? `Revoke ${name}?` : `Reactivate ${name}?`}
            </h3>
            {isActive ? (
              <p className="mt-2 text-sm text-ink/70">
                Revoking a judge who already has scores{" "}
                <span className="font-medium text-red-700">
                  removes their scores from the results
                </span>
                . Their drafts and finals stop counting immediately. This
                applies on the next results view.
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink/70">
                {name} will be able to sign in and score again.
              </p>
            )}
            {isSelf && (
              <p className="mt-2 text-sm text-red-700">
                This is your own account — the server will refuse.
              </p>
            )}
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
                disabled={busy}
                onClick={confirm}
                className={`flex-1 rounded-xl px-4 py-3 font-medium text-white shadow-md transition disabled:opacity-60 ${
                  isActive ? "bg-red-700 hover:bg-red-600" : "bg-green-700 hover:bg-green-600"
                }`}
              >
                {busy ? "Working…" : isActive ? "Revoke" : "Reactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
