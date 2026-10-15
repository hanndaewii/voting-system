"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addContestant,
  bulkAddContestants,
  updateContestant,
  deleteContestant,
} from "./actions";

interface Row {
  id: string;
  name: string;
  number: number;
  photo_url: string | null;
}

export default function ContestantsManager({
  contestId,
  rows,
  editable,
  deletable,
}: {
  contestId: string;
  rows: Row[];
  editable: boolean;
  deletable: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState("");

  async function run(p: Promise<{ ok: boolean; message: string }>) {
    setBusy(true);
    setMessage("");
    const res = await p;
    setOk(res.ok);
    setMessage(res.message);
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div>
      {message && (
        <p
          className={`mb-3 rounded-lg px-4 py-2.5 text-sm ring-1 ${
            ok ? "bg-green-50 text-green-800 ring-green-200" : "bg-red-50 text-red-700 ring-red-200"
          }`}
        >
          {message}
        </p>
      )}

      {editable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const name = String(fd.get("name") ?? "");
            e.currentTarget.reset();
            void run(addContestant(contestId, name));
          }}
        >
          <input
            name="name"
            required
            placeholder="Contestant name"
            disabled={busy}
            className="min-w-0 flex-1 rounded-xl border border-gold-200 bg-ivory px-4 py-2.5 text-ink placeholder:text-ink/30 focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-xl bg-gold-600 px-4 py-2.5 text-sm font-medium text-white shadow transition hover:bg-gold-500 disabled:opacity-60"
          >
            Add
          </button>
        </form>
      )}

      {editable && (
        <details className="mt-3 rounded-xl bg-ivory px-4 py-3 ring-1 ring-gold-100">
          <summary className="cursor-pointer text-sm font-medium text-gold-700">
            Bulk add (one name per line)
          </summary>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={4}
            placeholder={"Maria Santos\nAna Reyes"}
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-gold-200 bg-white px-4 py-2.5 text-ink placeholder:text-ink/30 focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            disabled={busy || !bulk.trim()}
            onClick={() => {
              const names = bulk.split("\n");
              setBulk("");
              void run(bulkAddContestants(contestId, names));
            }}
            className="mt-2 rounded-xl bg-gold-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-gold-500 disabled:opacity-60"
          >
            Add all
          </button>
        </details>
      )}

      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <RowEditor
            key={r.id}
            row={r}
            editable={editable}
            deletable={deletable}
            busy={busy}
            onSave={(patch) => run(updateContestant(r.id, patch))}
            onDelete={() => run(deleteContestant(r.id))}
          />
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-ink/60">No contestants yet.</li>
        )}
      </ul>
    </div>
  );
}

function RowEditor({
  row,
  editable,
  deletable,
  busy,
  onSave,
  onDelete,
}: {
  row: Row;
  editable: boolean;
  deletable: boolean;
  busy: boolean;
  onSave: (patch: { name?: string; number?: number }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [number, setNumber] = useState(String(row.number));
  const dirty = name.trim() !== row.name || number !== String(row.number);
  return (
    <li className="flex items-center gap-2 rounded-xl bg-ivory px-3 py-2 ring-1 ring-gold-100">
      <input
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        disabled={!editable || busy}
        inputMode="numeric"
        aria-label="Contestant number"
        className="w-14 shrink-0 rounded-lg border border-gold-200 bg-white px-2 py-2 text-center text-ink focus:border-gold-500 focus:outline-none disabled:opacity-50"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!editable || busy}
        aria-label="Contestant name"
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-2 font-medium text-ink focus:border-gold-500 focus:bg-white focus:outline-none disabled:opacity-70"
      />
      {editable && dirty && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ name, number: Number(number) })}
          className="shrink-0 rounded-lg bg-green-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
        >
          Save
        </button>
      )}
      {deletable && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete ${row.name}?`)) onDelete();
          }}
          className="shrink-0 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-100 disabled:opacity-60"
        >
          Delete
        </button>
      )}
    </li>
  );
}
