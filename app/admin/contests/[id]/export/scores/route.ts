import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Formula-injection guard: spreadsheet apps execute cells starting with
  // these characters. A leading single quote forces plain text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: (string | number | null)[][], filename: string): NextResponse {
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function requireLockedAdmin(contestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Not signed in." };
  const { data: me } = await supabase
    .from("judges")
    .select("is_admin,is_active")
    .eq("user_id", user.id)
    .eq("contest_id", contestId);
  const rows = (me ?? []) as { is_admin: boolean; is_active: boolean }[];
  if (!rows.some((r) => r.is_admin && r.is_active)) {
    return { supabase, error: "Admins only." };
  }
  const { data: contest } = await supabase
    .from("contests")
    .select("id,name,status,use_trimmed_average")
    .eq("id", contestId)
    .maybeSingle();
  const c = contest as {
    id: string;
    name: string;
    status: string;
    use_trimmed_average: boolean;
  } | null;
  if (!c) return { supabase, error: "Contest not found." };
  if (c.status !== "locked") return { supabase, error: "Exports open once the contest is locked." };
  return { supabase, error: null as string | null, contest: c };
}

// Every judge's FINAL scores: contestant, criterion, weight, judge, value.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error, contest } = await requireLockedAdmin(id);
  if (error || !contest) {
    return NextResponse.json({ error: error ?? "Not found." }, { status: 403 });
  }
  const { data, error: qerr } = await supabase
    .from("scores")
    .select("value,contestants(number,name),criteria(name,weight),judges(name)")
    .eq("contest_id", id)
    .eq("is_final", true)
    .order("created_at");
  if (qerr) return NextResponse.json({ error: qerr.message }, { status: 500 });

  type Row = {
    value: number;
    contestants: { number: number; name: string } | { number: number; name: string }[] | null;
    criteria: { name: string; weight: number } | { name: string; weight: number }[] | null;
    judges: { name: string } | { name: string }[] | null;
  };
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    !v ? null : Array.isArray(v) ? (v[0] ?? null) : v;

  const rows: (string | number | null)[][] = [
    ["contestant_number", "contestant_name", "criterion", "weight", "judge", "value"],
  ];
  for (const r of (data ?? []) as Row[]) {
    const ct = one(r.contestants);
    const cr = one(r.criteria);
    const j = one(r.judges);
    rows.push([ct?.number ?? null, ct?.name ?? null, cr?.name ?? null, cr?.weight ?? null, j?.name ?? null, r.value]);
  }
  return csv(rows, `scores-${contest.name.replace(/\s+/g, "-")}.csv`);
}
