import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolvePhotoUrl } from "@/lib/supabase/photos";
import LogoutButton from "@/components/logout-button";
import ContestantsManager from "../contestants-manager";
import CriteriaManager from "../criteria-manager";
import PhotoUpload from "../photo-upload";
import { TrimToggle, OpenButton, DeleteContest } from "../setup-actions";

export const dynamic = "force-dynamic";

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
          ok ? "bg-green-100 text-green-800" : "bg-gold-100 text-gold-700"
        }`}
      >
        {ok ? "✓" : "!"}
      </span>
      <span className={ok ? "text-ink" : "text-ink/60"}>{label}</span>
    </li>
  );
}

export default async function ContestSetupPage({
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
  // Global role routing is enforced by app/admin/layout.tsx (a page-level
  // redirect here would fire after the loading shell streams).

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
  if (!c) {
    return (
      <main className="min-h-screen bg-ivory px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-gold-100">
          <h1 className="font-display text-3xl text-ink">Contest not found</h1>
          <Link href="/admin/contests" className="mt-4 inline-block text-sm text-gold-700 underline">
            Back to contests
          </Link>
        </div>
      </main>
    );
  }

  // Must be this contest's admin (global admin role is not enough).
  // Rendered inline (not a redirect): this runs under the loading
  // Suspense boundary, where a thrown redirect can't become an HTTP 307.
  const { data: mine } = await supabase
    .from("judges")
    .select("is_admin,is_active")
    .eq("user_id", user.id)
    .eq("contest_id", id);
  const isOurs = ((mine ?? []) as { is_admin: boolean; is_active: boolean }[]).some(
    (j) => j.is_admin && j.is_active
  );
  if (!isOurs) {
    return (
      <main className="min-h-screen bg-ivory px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-gold-100">
          <h1 className="font-display text-3xl text-ink">Not your contest</h1>
          <p className="mt-2 text-sm text-ink/60">
            You administer other contests, but not this one.
          </p>
          <Link href="/admin/contests" className="mt-4 inline-block text-sm text-gold-700 underline">
            Back to contests
          </Link>
        </div>
      </main>
    );
  }

  const [{ data: contestants }, { data: criteria }, { data: judges }] =
    await Promise.all([
      supabase
        .from("contestants")
        .select("id,name,number,photo_url")
        .eq("contest_id", id)
        .order("number"),
      supabase
        .from("criteria")
        .select("id,name,weight")
        .eq("contest_id", id)
        .order("created_at"),
      supabase
        .from("judges")
        .select("id,name,is_admin,is_active")
        .eq("contest_id", id)
        .order("name"),
    ]);

  const cts = (contestants ?? []) as {
    id: string;
    name: string;
    number: number;
    photo_url: string | null;
  }[];
  const crits = (criteria ?? []) as { id: string; name: string; weight: number }[];
  const roster = (judges ?? []) as {
    id: string;
    name: string;
    is_admin: boolean;
    is_active: boolean;
  }[];

  const photoUrls = Object.fromEntries(
    await Promise.all(cts.map(async (t) => [t.id, await resolvePhotoUrl(t.photo_url)] as const))
  );

  const activeJudges = roster.filter((j) => j.is_active && !j.is_admin).length;
  const isDraft = c.status === "draft";
  const isOpen = c.status === "open";
  const isLocked = c.status === "locked";
  const structEditable = isDraft; // criteria/list/numbers/deletes: draft only
  const namePhotoEditable = isDraft || isOpen;

  const readyContestants = cts.length > 0;
  const readyCriteria = crits.length > 0;
  const readyJudges = activeJudges > 0;

  return (
    <main className="min-h-screen bg-ivory px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <Link href="/admin/contests" className="text-sm text-gold-700 underline underline-offset-4">
              ← All contests
            </Link>
            <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">{c.name}</h1>
            <p className="mt-1 text-xs tracking-widest text-ink/50 uppercase">
              Setup · {c.status}
            </p>
          </div>
          <LogoutButton />
        </div>

        {/* Readiness */}
        <div className="rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100">
          <h2 className="font-display text-xl text-ink">Readiness</h2>
          <ul className="mt-2 space-y-1.5">
            <Check ok={readyContestants} label={`Contestants (${cts.length})`} />
            <Check ok={readyCriteria} label={`Criteria (${crits.length})`} />
            <Check ok={readyJudges} label={`Judges invited (${activeJudges} active)`} />
            <Check ok={isOpen || isLocked} label={`Status: ${c.status}`} />
          </ul>
          {!isDraft && (
            <p className="mt-3 rounded-lg bg-gray-100 px-4 py-2.5 text-sm text-gray-700">
              {isOpen
                ? "Open: criteria, weights, numbers and the lineup are frozen. Names and photos stay editable."
                : "Locked: everything is frozen."}
            </p>
          )}
        </div>

        {/* Contestants */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <h2 className="font-display text-xl text-ink">Contestants</h2>
          {!structEditable && (
            <p className="mt-1 text-xs text-ink/50">
              {isOpen ? "Add/delete frozen while open — names, numbers and photos below stay editable." : "Frozen — contest is locked."}
            </p>
          )}
          <div className="mt-3">
            <ContestantsManager
              contestId={id}
              rows={cts}
              editable={namePhotoEditable}
              deletable={structEditable}
            />
          </div>
          <ul className="mt-3 space-y-2">
            {cts.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl bg-ivory px-3 py-2 ring-1 ring-gold-100"
              >
                {photoUrls[t.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrls[t.id]!}
                    alt={t.name}
                    className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-gold-200"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-sm font-medium text-gold-800 ring-2 ring-gold-200">
                    #{t.number}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {t.name}
                </span>
                <PhotoUpload
                  contestId={id}
                  contestantId={t.id}
                  currentPath={t.photo_url}
                  disabled={!namePhotoEditable}
                />
              </li>
            ))}
          </ul>
        </div>

        {/* Criteria */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <h2 className="font-display text-xl text-ink">Criteria</h2>
          {!structEditable && (
            <p className="mt-1 text-xs text-ink/50">
              Frozen — {isOpen ? "weights and names lock once open." : "contest is locked."}
            </p>
          )}
          <div className="mt-3">
            <CriteriaManager
              rows={crits}
              contestId={id}
              editable={structEditable}
              deletable={structEditable}
            />
          </div>
        </div>

        {/* Settings */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <h2 className="font-display text-xl text-ink">Settings</h2>
          <div className="mt-3">
            <TrimToggle contestId={id} value={c.use_trimmed_average} locked={isLocked} />
          </div>
        </div>

        {/* Judges */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <h2 className="font-display text-xl text-ink">Judges ({activeJudges} active)</h2>
          <ul className="mt-3 space-y-1.5">
            {roster.map((j) => (
              <li key={j.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink">
                  {j.name}
                  {j.is_admin && (
                    <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs text-gold-800">
                      admin
                    </span>
                  )}
                </span>
                {!j.is_active && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                    revoked
                  </span>
                )}
              </li>
            ))}
            {roster.length === 0 && <li className="text-sm text-ink/60">Nobody yet.</li>}
          </ul>
          <Link
            href={`/admin?contest=${id}`}
            className="mt-3 inline-block text-sm text-gold-700 underline underline-offset-4"
          >
            Manage judges in the dashboard →
          </Link>
        </div>

        {/* Open + delete */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <h2 className="font-display text-xl text-ink">Status</h2>
          {isLocked && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/admin/contests/${id}/results`}
                className="rounded-xl bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500"
              >
                Printable results
              </Link>
              <a
                href={`/admin/contests/${id}/export/ranking`}
                className="rounded-xl border border-gold-300 px-4 py-2 text-sm font-medium text-gold-700 hover:bg-gold-50"
              >
                Ranking CSV
              </a>
              <a
                href={`/admin/contests/${id}/export/scores`}
                className="rounded-xl border border-gold-300 px-4 py-2 text-sm font-medium text-gold-700 hover:bg-gold-50"
              >
                Scores CSV
              </a>
            </div>
          )}
          <div className="mt-3 flex flex-col gap-3">
            <OpenButton contestId={id} isOpen={isOpen} isLocked={isLocked} />
            <DeleteContest contestId={id} contestName={c.name} isDraft={isDraft} />
          </div>
        </div>
      </div>
    </main>
  );
}
