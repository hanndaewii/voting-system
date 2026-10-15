import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/roles";

// Section guard (see app/admin/layout.tsx for why the guard lives here).
export default async function JudgeLayout({
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
  if (role === "admin") redirect("/admin");
  if (role !== "judge") redirect("/no-access");
  return <>{children}</>;
}
