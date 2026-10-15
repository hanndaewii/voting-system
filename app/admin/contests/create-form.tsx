"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createContest } from "./actions";

export default function CreateContestForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const name = String(fd.get("name") ?? "");
          setBusy(true);
          setMessage("");
          const res = await createContest(name);
          setBusy(false);
          setOk(res.ok);
          setMessage(res.message);
          if (res.ok && res.contestId) {
            router.push(`/admin/contests/${res.contestId}`);
            router.refresh();
          }
        }}
      >
        <input
          name="name"
          required
          placeholder="New contest name"
          disabled={busy}
          className="min-w-0 flex-1 rounded-xl border border-gold-200 bg-ivory px-4 py-2.5 text-ink placeholder:text-ink/30 focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-xl bg-gold-600 px-4 py-2.5 text-sm font-medium text-white shadow transition hover:bg-gold-500 disabled:opacity-60"
        >
          Create
        </button>
      </form>
      {message && (
        <p
          className={`mt-2 rounded-lg px-4 py-2.5 text-sm ring-1 ${
            ok ? "bg-green-50 text-green-800 ring-green-200" : "bg-red-50 text-red-700 ring-red-200"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
