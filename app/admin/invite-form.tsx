"use client";

import { useState } from "react";
import { inviteJudge } from "./actions";

export default function InviteForm({
  contests,
  fixedContestId,
}: {
  contests: { id: string; name: string }[];
  fixedContestId?: string;
}) {
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setMessage("");
    formData.set("origin", window.location.origin);
    const result = await inviteJudge(formData);
    setOk(result.ok);
    setMessage(result.message);
    setPending(false);
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-ink">
            Judge name
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="Judge One"
            className="w-full rounded-xl border border-gold-200 bg-ivory px-4 py-2.5 text-ink placeholder:text-ink/30 focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="judge@example.com"
            className="w-full rounded-xl border border-gold-200 bg-ivory px-4 py-2.5 text-ink placeholder:text-ink/30 focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none"
          />
        </div>
      </div>
      <div>
        <label htmlFor="contestId" className="mb-1 block text-sm font-medium text-ink">
          Contest
        </label>
        {fixedContestId ? (
          <>
            <input type="hidden" name="contestId" value={fixedContestId} />
            <p className="rounded-xl bg-ivory px-4 py-2.5 text-ink ring-1 ring-gold-200">
              {contests.find((c) => c.id === fixedContestId)?.name ?? "Selected contest"}
            </p>
          </>
        ) : (
          <select
            id="contestId"
            name="contestId"
            required
            defaultValue=""
            className="w-full rounded-xl border border-gold-200 bg-ivory px-4 py-2.5 text-ink focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none"
          >
            <option value="" disabled>
              Select a contest…
            </option>
            {contests.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {message && (
        <p
          className={`rounded-lg px-4 py-3 text-sm ring-1 ${
            ok
              ? "bg-green-50 text-green-800 ring-green-200"
              : "bg-red-50 text-red-700 ring-red-200"
          }`}
        >
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-gold-600 px-5 py-2.5 font-medium text-white shadow-md transition hover:bg-gold-500 disabled:opacity-60"
      >
        {pending ? "Inviting…" : "Invite judge"}
      </button>
    </form>
  );
}
