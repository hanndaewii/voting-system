"use client";

import { useState } from "react";
import { resendJudgeLink } from "./actions";

export default function ResendButton({
  judgeId,
  name,
  knownEmail,
}: {
  judgeId: string;
  name: string;
  knownEmail: string | null;
}) {
  const [email, setEmail] = useState(knownEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  async function send() {
    setBusy(true);
    setMessage("");
    const res = await resendJudgeLink(
      judgeId,
      window.location.origin,
      knownEmail ? undefined : email
    );
    setBusy(false);
    setOk(res.ok);
    setMessage(res.message);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {!knownEmail && (
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="judge email"
          type="email"
          aria-label={`Email for ${name}`}
          className="w-36 rounded-lg border border-gold-200 bg-white px-2 py-1.5 text-xs text-ink placeholder:text-ink/30 focus:border-gold-500 focus:outline-none"
        />
      )}
      <button
        type="button"
        disabled={busy}
        onClick={send}
        title={`Send ${name} a fresh login link`}
        className="rounded-lg bg-gold-100 px-3 py-1.5 text-xs font-medium text-gold-800 transition hover:bg-gold-200 disabled:opacity-60"
      >
        {busy ? "…" : "Resend link"}
      </button>
      {message && (
        <span className={`text-xs ${ok ? "text-green-700" : "text-red-700"}`}>{message}</span>
      )}
    </span>
  );
}
