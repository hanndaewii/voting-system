"use client";

import Link from "next/link";

// Contest picker that remembers the selection in a cookie, so /admin
// without ?contest= lands on the last-viewed contest.
export default function ContestPicker({
  contests,
  currentId,
  base,
}: {
  contests: { id: string; name: string; status: string }[];
  currentId: string;
  base: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {contests.map((c) => (
        <Link
          key={c.id}
          href={`${base}?contest=${c.id}`}
          onClick={() => {
            document.cookie = `cwpc-contest=${c.id}; path=/; max-age=31536000`;
          }}
          className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
            c.id === currentId
              ? "bg-gold-600 text-white ring-gold-600"
              : "bg-white text-gold-700 ring-gold-200 hover:bg-gold-50"
          }`}
        >
          {c.name}
          <span className="ml-1 text-xs opacity-70">· {c.status}</span>
        </Link>
      ))}
    </div>
  );
}
