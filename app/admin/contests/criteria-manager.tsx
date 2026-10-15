"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addCriterion, updateCriterion, deleteCriterion } from "./actions";

interface Row {
  id: string;
  name: string;
  weight: number;
}

export default function CriteriaManager({
  rows,
  contestId,
  editable,
  deletable,
}: {
  rows: Row[];
  contestId: string;
  editable: boolean;
  deletable: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState(false);

  const total = rows.reduce((s, r) => s + Number(r.weight), 0);

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
            const weight = Number(fd.get("weight") ?? 1);
            e.currentTarget.reset();
            void run(addCriterion(contestId, name, weight));
          }}
        >
          <input
            name="name"
            required
            placeholder="Criterion name"
            disabled={busy}
            className="min-w-0 flex-1 rounded-xl border border-gold-200 bg-ivory px-4 py-2.5 text-ink placeholder:text-ink/30 focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none disabled:opacity-50"
          />
          <input
            name="weight"
            type="number"
            min={0.01}
            step={0.25}
            defaultValue={1}
            disabled={busy}
            aria-label="Weight"
            className="w-20 shrink-0 rounded-xl border border-gold-200 bg-ivory px-3 py-2.5 text-center text-ink focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none disabled:opacity-50"
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

      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <CriterionRow
            key={r.id}
            row={r}
            total={total}
            editable={editable}
            deletable={deletable}
            busy={busy}
            onSave={(patch) => run(updateCriterion(r.id, patch))}
            onDelete={() => run(deleteCriterion(r.id))}
          />
        ))}
        {rows.length === 0 && <li className="text-sm text-ink/60">No criteria yet.</li>}
      </ul>
    </div>
  );
}

function CriterionRow({
  row,
  total,
  editable,
  deletable,
  busy,
  onSave,
  onDelete,
}: {
  row: Row;
  total: number;
  editable: boolean;
  deletable: boolean;
  busy: boolean;
  onSave: (patch: { name?: string; weight?: number }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [weight, setWeight] = useState(String(row.weight));
  const dirty = name.trim() !== row.name || weight !== String(row.weight);
  const pct = total > 0 ? (Number(row.weight) / total) * 100 : 0;
  return (
    <li className="flex items-center gap-2 rounded-xl bg-ivory px-3 py-2 ring-1 ring-gold-100">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!editable || busy}
        aria-label="Criterion name"
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-2 font-medium text-ink focus:border-gold-500 focus:bg-white focus:outline-none disabled:opacity-70"
      />
      <span className="shrink-0 text-xs text-ink/50">{pct.toFixed(0)}%</span>
      <input
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        disabled={!editable || busy}
        type="number"
        min={0.01}
        step={0.25}
        aria-label="Weight"
        className="w-20 shrink-0 rounded-lg border border-gold-200 bg-white px-2 py-2 text-center text-ink focus:border-gold-500 focus:outline-none disabled:opacity-50"
      />
      {editable && dirty && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ name, weight: Number(weight) })}
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
