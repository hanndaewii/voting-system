import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/roles";
import LogoutButton from "@/components/logout-button";
import CreateContestForm from "./create-form";

export const dynamic = "force-dynamic";

export default async function ContestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if ((await getRole(supabase, user.id)) !== "admin") redirect("/no-access");

  // Newest first: the dashboard defaults to the newest contest.
  const { data: contests } = await supabase
    .from("contests")
    .select("id,name,status,created_at")
    .order("created_at", { ascending: false });
  const list = (contests ?? []) as {
    id: string;
    name: string;
    status: string;
    created_at: string;
  }[];

  return (
    <main className="min-h-screen bg-ivory px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-widest text-gold-700 uppercase">
              CWPC Judging
            </p>
            <h1 className="font-display text-3xl text-ink sm:text-4xl">Contests</h1>
            <p className="mt-1 text-sm text-ink/60">{user.email}</p>
          </div>
          <LogoutButton />
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <h2 className="font-display text-xl text-ink">Create contest</h2>
          <p className="mt-1 text-sm text-ink/60">
            Starts as a draft. You become its admin.
          </p>
          <div className="mt-3">
            <CreateContestForm />
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-5 shadow-xl shadow-gold-100 ring-1 ring-gold-100 sm:p-6">
          <h2 className="font-display text-xl text-ink">All contests</h2>
          <ul className="mt-3 space-y-2">
            {list.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-ivory px-4 py-3 ring-1 ring-gold-100"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{c.name}</span>
                  <span className="text-xs tracking-wide text-ink/50 uppercase">
                    {c.status}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <Link
                    href={`/admin?contest=${c.id}`}
                    className="rounded-lg bg-gold-100 px-3 py-2 text-xs font-medium text-gold-800 hover:bg-gold-200"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href={`/admin/contests/${c.id}`}
                    className="rounded-lg bg-gold-600 px-3 py-2 text-xs font-medium text-white hover:bg-gold-500"
                  >
                    Setup
                  </Link>
                </span>
              </li>
            ))}
            {list.length === 0 && (
              <li className="text-sm text-ink/60">No contests yet.</li>
            )}
          </ul>
        </div>
      </div>
    </main>
  );
}
