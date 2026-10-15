import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/roles";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

// Printable final ranking. Admin-only, locked-only, no per-judge scores.
export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if ((await getRole(supabase, user.id)) !== "admin") redirect("/no-access");

  const { data: contest } = await supabase
    .from("contests")
    .select("id,name,status,use_trimmed_average")
    .eq("id", id)
    .maybeSingle();
  const c = contest as {
    id: string;
    name: string;
    status: string;
    use_trimmed_average: boolean;
  } | null;
  if (!c) redirect("/admin/contests");

  if (c.status !== "locked") {
    return (
      <main className="min-h-screen bg-ivory px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-gold-100">
          <h1 className="font-display text-3xl text-ink">Results aren&apos;t final yet</h1>
          <p className="mt-2 text-sm text-ink/60">
            The printable ranking opens once {c.name} is locked.
          </p>
          <Link
            href={`/admin/contests/${id}`}
            className="mt-4 inline-block text-sm text-gold-700 underline"
          >
            Back to setup
          </Link>
        </div>
      </main>
    );
  }

  const { data } = await supabase.rpc("get_results", { p_contest_id: id });
  const board = (data ?? []) as {
    rank: number;
    number: number;
    name: string;
    final_score: number | null;
    judges_counted: number;
    top_criterion_avg: number | null;
  }[];

  return (
    <main className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs tracking-widest text-gold-700 uppercase">Final results</p>
            <h1 className="font-display text-4xl text-ink">{c.name}</h1>
            <p className="mt-1 text-sm text-ink/60">
              {c.use_trimmed_average
                ? "Trimmed average (highest and lowest judge scores dropped, 3+ judges)"
                : "Simple average of judges' weighted scores"}
            </p>
          </div>
          <PrintButton />
        </div>
        <table className="mt-6 w-full text-left">
          <thead>
            <tr className="border-b-2 border-gold-300 text-xs tracking-wide text-ink/60 uppercase">
              <th className="py-2 pr-3">Rank</th>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Contestant</th>
              <th className="py-2 pr-3 text-right">Score</th>
              <th className="py-2 text-right">Judges</th>
            </tr>
          </thead>
          <tbody>
            {board.map((r) => (
              <tr key={r.number} className="border-b border-gold-100">
                <td className="py-3 pr-3 font-display text-2xl text-gold-700">{r.rank}</td>
                <td className="py-3 pr-3 text-ink/60">#{r.number}</td>
                <td className="py-3 pr-3 font-medium text-ink">{r.name}</td>
                <td className="py-3 pr-3 text-right font-display text-2xl text-ink">
                  {r.final_score === null ? "–" : Number(r.final_score).toFixed(2)}
                </td>
                <td className="py-3 text-right text-ink/60">{r.judges_counted}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 flex gap-3 print:hidden">
          <a
            href={`/admin/contests/${id}/export/ranking`}
            className="rounded-xl bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500"
          >
            Download ranking CSV
          </a>
          <a
            href={`/admin/contests/${id}/export/scores`}
            className="rounded-xl border border-gold-300 px-4 py-2 text-sm font-medium text-gold-700 hover:bg-gold-50"
          >
            Download scores CSV
          </a>
          <Link href={`/admin?contest=${id}`} className="px-2 py-2 text-sm text-gold-700 underline">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
