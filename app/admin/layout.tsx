import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/roles";

// Section guard: runs BEFORE any loading Suspense boundary below can
// stream, so these redirects are real HTTP 307s (page-level redirects
// under a loading.tsx would stream first and only bounce client-side).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const role = await getRole(supabase, user.id);
  if (role === "judge") redirect("/judge");
  if (role !== "admin") redirect("/no-access");
  return <>{children}</>;
}
