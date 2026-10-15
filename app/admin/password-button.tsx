"use client";

import { useState } from "react";
import { setJudgePassword } from "./actions";

export default function PasswordButton({
  judgeId,
  name,
}: {
  judgeId: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setMessage("");
    setTemp(null);
    setCopied(false);
    const res = await setJudgePassword(judgeId);
    setBusy(false);
    if (res.ok && res.tempPassword) {
      setTemp(res.tempPassword);
    } else {
      setMessage(res.message);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={generate}
        title={`Set a login password for ${name}`}
        className="rounded-lg bg-gold-100 px-3 py-1.5 text-xs font-medium text-gold-800 transition hover:bg-gold-200 disabled:opacity-60"
      >
        {busy ? "…" : "Set password"}
      </button>
      {message && <span className="text-xs text-red-700">{message}</span>}
      {temp && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-mono text-white">
          {temp}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(temp).then(() => setCopied(true));
            }}
            className="underline underline-offset-2"
          >
            {copied ? "copied" : "copy"}
          </button>
        </span>
      )}
    </span>
  );
}
