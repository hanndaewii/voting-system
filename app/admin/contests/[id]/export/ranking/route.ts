import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Formula-injection guard: spreadsheet apps execute cells starting with
  // these characters. A leading single quote forces plain text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Final ranking as computed by get_results() — the single source of truth.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 403 });

  const { data: me } = await supabase
    .from("judges")
    .select("is_admin,is_active")
    .eq("user_id", user.id)
    .eq("contest_id", id);
  const rows = (me ?? []) as { is_admin: boolean; is_active: boolean }[];
  if (!rows.some((r) => r.is_admin && r.is_active)) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

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
  if (!c) return NextResponse.json({ error: "Contest not found." }, { status: 404 });
  if (c.status !== "locked") {
    return NextResponse.json({ error: "Exports open once the contest is locked." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("get_results", { p_contest_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const method = c.use_trimmed_average ? "trimmed" : "simple";
  const out: (string | number | null)[][] = [
    ["rank", "number", "name", "final_score", "judges_counted", "top_criterion_avg", "method"],
  ];
  for (const r of (data ?? []) as {
    rank: number;
    number: number;
    name: string;
    final_score: number | null;
    judges_counted: number;
    top_criterion_avg: number | null;
  }[]) {
    out.push([
      r.rank,
      r.number,
      r.name,
      r.final_score === null ? null : Number(r.final_score).toFixed(2),
      r.judges_counted,
      r.top_criterion_avg === null ? null : Number(r.top_criterion_avg).toFixed(2),
      method,
    ]);
  }
  const body = out.map((r) => r.map(csvCell).join(",")).join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ranking-${c.name.replace(/\s+/g, "-")}.csv"`,
    },
  });
}
