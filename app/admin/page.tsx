import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/roles";
import { resolvePhotoUrl } from "@/lib/supabase/photos";
import LogoutButton from "@/components/logout-button";
import InviteForm from "./invite-form";
import AdminLive from "./admin-live";
import LockButton from "./lock-button";
import JudgeRowActions from "./judge-row-actions";
import ResendButton from "./resend-button";
import PasswordButton from "./password-button";
import ContestPicker from "./contests/contest-picker";

export const dynamic = "force-dynamic";

interface ContestInfo {
  id: string;
  name: string;
  status: string;
}

interface Summary {
  total_contestants: number;
  total_scores: number;
  average_score: number | null;
  outstanding_scores: number;
  judges_total: number;
  judges_submitted: number;
}

interface ResultRow {
  rank: number;
  contestant_id: string;
  number: number;
  name: string;
  photo_url: string | null;
  final_score: number | null;
  judges_counted: number;
  top_criterion_avg: number | null;
}

interface ProgressRow {
  judge_id: string;
  name: string;
  is_active: boolean;
  contestants_scored: number;
  total_contestants: number;
  has_submitted: boolean;
  average_score_given: number | null;
  outstanding_count: number;
}

interface ManageRow {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  is_admin: boolean;
  is_active: boolean;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function fmt(n: number | null) {
  return n === null || n === undefined ? "—" : Number(n).toFixed(2);
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ contest?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if ((await getRole(supabase, user.id)) !== "admin") redirect("/no-access");

  const { data: contests } = await supabase
    .from("contests")
    .select("id,name,status")
    .order("created_at", { ascending: false });
  const contestList = (contests ?? []) as ContestInfo[];
  if (contestList.length === 0) {
    return (
      <main className="min-h-screen bg-ivory px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-gold-100">
          <h1 className="font-display text-3xl text-ink">No contests yet</h1>
          <p className="mt-2 text-sm text-ink/60">Create one in the database first.</p>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  // No explicit pick: resume the remembered contest, else the newest.
  let contest =
    contestList.find((c) => c.id === params.contest) ?? null;
  if (!contest) {
    const saved = (await cookies()).get("cwpc-contest")?.value;
    contest = contestList.find((c) => c.id === saved) ?? contestList[0];
  }
  const isLocked = contest.status === "locked";

  const [{ data: summaryRows }, { data: results }, { data: progress }, { data: judges }] =
    await Promise.all([
      supabase.rpc("admin_summary", { p_contest_id: contest.id }),
      supabase.rpc("get_results", { p_contest_id: contest.id }),
      supabase.rpc("admin_judge_progress", { p_contest_id: contest.id }),
      supabase
        .from("judges")
        .select("id,user_id,name,email,is_admin,is_active")
        .eq("contest_id", contest.id)
        .order("name"),
    ]);

  const summary = ((summaryRows ?? []) as Summary[])[0] ?? null;
  const board = (results ?? []) as ResultRow[];
  const photoMap: Record<string, string | null> = Object.fromEntries(
    await Promise.all(
      board.map(
        async (r) => [r.contestant_id, await resolvePhotoUrl(r.photo_url)] as const
      )
    )
  );
  const prog = (progress ?? []) as ProgressRow[];
  const manage = (judges ?? []) as ManageRow[];
  const unsubmitted = prog
    .filter((p) => p.is_active && !p.has_submitted)
    .map((p) => p.name);

  const cards = summary
    ? [
        { label: "Contestants", value: String(summary.total_contestants) },
        { label: "Scores in", value: String(summary.total_scores) },
        { label: "Live average", value: fmt(summary.average_score) },
        { label: "Outstanding (≥9)", value: String(summary.outstanding_scores) },
        {
          label: "Judges submitted",
          value: `${summary.judges_submitted}/${summary.judges_total}`,
        },
      ]
    : [];

  return (
    <main className="min-h-screen bg-ivory px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-widest text-gold-700 uppercase">
              CWPC Judging
            </p>
            <h1 className="font-display text-3xl text-ink sm:text-4xl">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-ink/60">{user.email}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <LogoutButton />
            <AdminLive contestId={contest.id} />
          </div>
        </div>

        {contestList.length > 1 && (
          <div className="mb-4">
            <ContestPicker
              contests={contestList.map((c) => ({ id: c.id, name: c.name, status: c.status }))}
              currentId={contest.id}
              base="/admin"
            />
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-2xl bg-white p-4 text-center shadow-xl shadow-gold-100 ring-1 ring-gold-100"
            >
              <p className="font-display text-2xl text-ink sm:text-3xl">{c.value}</p>
              <p className="mt-1 text-xs tracking-wide text-ink/60 uppercase">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Leaderboard */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-ink">Leaderboard</h2>
            {isLocked && (
              <span className="rounded-full bg-gold-600 px-3 py-1 text-xs font-medium tracking-widest text-white uppercase">
                Final
              </span>
            )}
          </div>
          {!isLocked && (
            <p className="mt-1 text-xs text-ink/50">
              Live standings from final scores only — judges cannot see this yet.
            </p>
          )}
          <ul className="mt-4 space-y-2">
            {board.map((r) => (
              <li
                key={r.contestant_id}
                className="flex items-center gap-3 rounded-xl bg-ivory px-3 py-2.5 ring-1 ring-gold-100"
              >
                <span className="w-8 shrink-0 text-center font-display text-xl text-gold-700">
                  {r.rank ?? "–"}
                </span>
                {photoMap[r.contestant_id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoMap[r.contestant_id]!}
                    alt={r.name}
                    className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-gold-200"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-100 font-display text-gold-800 ring-2 ring-gold-200">
                    {initials(r.name)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">
                    <span className="mr-2 rounded-md bg-ink px-1.5 py-0.5 text-xs text-white">
                      #{r.number}
                    </span>
                    {r.name}
                  </span>
                  <span className="text-xs text-ink/50">
                    {r.judges_counted} judge{r.judges_counted === 1 ? "" : "s"} counted
                  </span>
                </span>
                <span className="shrink-0 font-display text-2xl text-ink">
                  {r.final_score === null ? "–" : Number(r.final_score).toFixed(2)}
                </span>
              </li>
            ))}
            {board.length === 0 && (
              <li className="text-sm text-ink/60">No final scores yet.</li>
            )}
          </ul>
        </div>

        {/* Judge progress */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <h2 className="font-display text-xl text-ink">Judge progress</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="text-xs tracking-wide text-ink/50 uppercase">
                  <th className="pb-2 pr-3">Judge</th>
                  <th className="pb-2 pr-3">Avg given</th>
                  <th className="pb-2 pr-3">Scored</th>
                  <th className="pb-2 pr-3">Submitted</th>
                  <th className="pb-2 pr-3">≥9</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {prog.map((p) => (
                  <tr key={p.judge_id} className="border-t border-gold-100">
                    <td className="py-2.5 pr-3 font-medium text-ink">{p.name}</td>
                    <td className="py-2.5 pr-3 text-ink">{fmt(p.average_score_given)}</td>
                    <td className="py-2.5 pr-3 text-ink">
                      {p.contestants_scored}/{p.total_contestants} scored
                    </td>
                    <td className="py-2.5 pr-3">
                      {p.has_submitted ? (
                        <span className="font-medium text-green-700">✓ Yes</span>
                      ) : (
                        <span className="text-ink/50">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-ink">{p.outstanding_count}</td>
                    <td className="py-2.5">
                      {p.is_active ? (
                        <span className="text-green-700">Active</span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          Revoked
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Manage judges */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <h2 className="font-display text-xl text-ink">Manage judges</h2>
          {isLocked && (
            <p className="mt-1 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700">
              Frozen — the contest is locked. The database blocks all judge changes.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {manage.map((j) => (
              <li
                key={j.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-ivory px-4 py-3 ring-1 ring-gold-100"
              >
                <span className="font-medium text-ink">
                  {j.name}
                  {j.is_admin && (
                    <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs text-gold-800">
                      admin
                    </span>
                  )}
                  {!j.is_active && (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      revoked
                    </span>
                  )}
                </span>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {!j.is_admin && (
                    <>
                      <ResendButton judgeId={j.id} name={j.name} knownEmail={j.email} />
                      <PasswordButton judgeId={j.id} name={j.name} />
                    </>
                  )}
                  <JudgeRowActions
                    judgeId={j.id}
                    name={j.name}
                    isActive={j.is_active}
                    isAdmin={j.is_admin}
                    isLocked={isLocked}
                    isSelf={j.user_id === user.id}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-gold-100 pt-4">
            <h3 className="font-medium text-ink">Invite a judge</h3>
            <div className="mt-2">
              <InviteForm contests={[{ id: contest.id, name: contest.name }]} fixedContestId={contest.id} />
            </div>
          </div>
        </div>

        {/* Lock */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <h2 className="font-display text-xl text-ink">Close the contest</h2>
          {isLocked ? (
            <p className="mt-2 rounded-lg bg-gold-100 px-4 py-3 text-sm font-medium text-gold-800">
              This contest is locked. Results are final.
            </p>
          ) : (
            <div className="mt-3">
              <p className="mb-3 text-sm text-ink/60">
                Locking freezes scores, judges and settings, and reveals the
                results to judges. It cannot be undone.
              </p>
              <LockButton contestId={contest.id} contestName={contest.name} unsubmitted={unsubmitted} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
