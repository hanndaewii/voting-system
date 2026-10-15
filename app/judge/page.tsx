import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolvePhotoUrl } from "@/lib/supabase/photos";
import LogoutButton from "@/components/logout-button";
import ScoreSheet from "./score-sheet";

export const dynamic = "force-dynamic";

interface ContestInfo {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface JudgeRow {
  id: string;
  contest_id: string;
  contests: ContestInfo[] | ContestInfo | null;
}

// Supabase types an embedded many-to-one as an array; the API returns one object.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function JudgeHome({
  searchParams,
}: {
  searchParams: Promise<{ contest?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Role routing is enforced by app/judge/layout.tsx (see app/admin/layout.tsx).

  const { data: jrows } = await supabase
    .from("judges")
    .select("id,contest_id,contests(id,name,status,created_at)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("is_admin", false);
  const rows = ((jrows ?? []) as JudgeRow[]).filter((r) => one(r.contests));
  // Layout guarantees at least one row; render empty instead of redirecting
  // (a redirect here would fire after the loading shell streams).
  if (rows.length === 0) {
    return (
      <main className="min-h-screen bg-ivory px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-gold-100">
          <h1 className="font-display text-3xl text-ink">No contests assigned</h1>
          <p className="mt-2 text-sm text-ink/60">Ask your administrator for an invite.</p>
        </div>
      </main>
    );
  }

  // Most recent non-draft contest wins; explicit ?contest= still respected.
  const byNewest = [...rows].sort(
    (a, b) =>
      Date.parse(one(b.contests)!.created_at) - Date.parse(one(a.contests)!.created_at)
  );
  const params = await searchParams;
  const picked =
    byNewest.find((r) => r.contest_id === params.contest) ??
    byNewest.find((r) => one(r.contests)?.status !== "draft") ??
    byNewest[0];
  const contest = one(picked.contests)!;

  const [{ data: contestants }, { data: criteria }, { data: scores }] =
    await Promise.all([
      supabase
        .from("contestants")
        .select("id,name,number,photo_url")
        .eq("contest_id", contest.id)
        .order("number"),
      supabase
        .from("criteria")
        .select("id,name,weight")
        .eq("contest_id", contest.id)
        .order("created_at"),
      supabase
        .from("scores")
        .select("contestant_id,criterion_id,value,is_final")
        .eq("judge_id", picked.id)
        .eq("contest_id", contest.id),
    ]);

  const scoreList = (scores ?? []) as {
    contestant_id: string;
    criterion_id: string;
    value: number;
    is_final: boolean;
  }[];
  const submitted = scoreList.length > 0 && scoreList.every((s) => s.is_final);

  const rawContestants = (contestants ?? []) as {
    id: string;
    name: string;
    number: number;
    photo_url: string | null;
  }[];
  const withPhotos = await Promise.all(
    rawContestants.map(async (t) => ({
      ...t,
      photo_url: await resolvePhotoUrl(t.photo_url),
    }))
  );

  return (
    <main className="min-h-screen bg-ivory px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-widest text-gold-700 uppercase">
              CWPC Judging
            </p>
            <h1 className="font-display text-3xl text-ink sm:text-4xl">Judge Portal</h1>
            <p className="mt-1 text-sm text-ink/60">{user.email}</p>
          </div>
          <LogoutButton />
        </div>

        <ScoreSheet
          userEmail={user.email ?? ""}
          judgeId={picked.id}
          contests={rows.map((r) => {
            const c = one(r.contests)!;
            return { id: c.id, name: c.name, status: c.status };
          })}
          contest={{ id: contest.id, name: contest.name, status: contest.status }}
          contestants={withPhotos}
          criteria={(criteria ?? []) as { id: string; name: string; weight: number }[]}
          initialScores={scoreList}
          initialSubmitted={submitted}
        />
      </div>
    </main>
  );
}
