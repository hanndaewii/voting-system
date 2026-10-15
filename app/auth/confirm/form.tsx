"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConfirmForm({
  code,
  tokenHash,
  type,
  next,
}: {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  next: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onContinue() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, token_hash: tokenHash, type, next }),
      });
      const data = (await res.json()) as { ok: boolean; redirect?: string; message?: string };
      if (data.ok && data.redirect) {
        router.push(data.redirect);
        router.refresh();
      } else {
        setError(data.message ?? "That link is invalid or expired.");
        setBusy(false);
      }
    } catch {
      setError("Network error. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}{" "}
          <a href="/login" className="font-medium underline underline-offset-4">
            Request a new link
          </a>
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onContinue}
        className="w-full rounded-xl bg-gold-600 px-4 py-4 text-lg font-medium text-white shadow-md transition hover:bg-gold-500 disabled:opacity-60"
      >
        {busy ? "Signing you in…" : "Continue to CWPC"}
      </button>
    </div>
  );
}
