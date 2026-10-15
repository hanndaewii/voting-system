"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestLoginLink, verifyLoginCode } from "./actions";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginForm({ returnTo }: { returnTo: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"link" | "code">("link");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    const res = await requestLoginLink(email, window.location.origin, returnTo);
    if (res.ok) {
      setStatus("sent");
    } else {
      setMessage(res.message);
      setStatus("error");
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    const res = await verifyLoginCode(email, code, returnTo);
    if (res.ok && res.redirect) {
      router.push(res.redirect);
      router.refresh();
    } else {
      setMessage(res.message);
      setStatus("error");
    }
  }

  if (status === "sent" && mode === "link") {
    return (
      <div className="text-center">
        <p className="font-display text-2xl text-ink">Check your email</p>
        <p className="mt-2 text-sm text-ink/70">
          A login link is on its way to <span className="font-medium">{email}</span>.
          Clicking it asks you to press Continue — scanners can&apos;t use it up.
        </p>
        <p className="mt-2 text-sm text-ink/70">
          The same email carries a 6-digit code — you can enter it below instead.
        </p>
        <div className="mt-4 flex justify-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => {
              setMode("code");
              setStatus("idle");
              setMessage("");
            }}
            className="text-gold-700 underline underline-offset-4 hover:text-gold-600"
          >
            Enter the 6-digit code
          </button>
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="text-gold-700 underline underline-offset-4 hover:text-gold-600"
          >
            Different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="judge@example.com"
          className="w-full rounded-xl border border-gold-200 bg-ivory px-4 py-3 text-ink placeholder:text-ink/30 focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none"
        />
      </div>

      {mode === "link" ? (
        <form onSubmit={sendLink} className="space-y-4">
          {status === "error" && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-xl bg-gold-600 px-4 py-3 font-medium text-white shadow-md transition hover:bg-gold-500 disabled:opacity-60"
          >
            {status === "sending" ? "Sending link…" : "Email me a login link"}
          </button>
          <p className="text-center text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("code");
                setStatus("idle");
                setMessage("");
              }}
              className="text-gold-700 underline underline-offset-4 hover:text-gold-600"
            >
              I have a 6-digit code
            </button>
          </p>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-ink">
              6-digit code from your email
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-xl border border-gold-200 bg-ivory px-4 py-3 text-center text-2xl tracking-[0.5em] text-ink placeholder:text-ink/30 focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none"
            />
          </div>
          {status === "error" && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-xl bg-gold-600 px-4 py-3 font-medium text-white shadow-md transition hover:bg-gold-500 disabled:opacity-60"
          >
            {status === "sending" ? "Verifying…" : "Sign in with code"}
          </button>
          <p className="text-center text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("link");
                setStatus("idle");
                setMessage("");
              }}
              className="text-gold-700 underline underline-offset-4 hover:text-gold-600"
            >
              Back to email link
            </button>
          </p>
        </form>
      )}
    </div>
  );
}
