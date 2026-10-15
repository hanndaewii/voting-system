import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/roles";

// Signed-in users don't need the login form (see app/admin/layout.tsx
// for why the guard lives here).
export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const role = await getRole(supabase, user.id);
    redirect(role === "admin" ? "/admin" : role === "judge" ? "/judge" : "/no-access");
  }
  return <>{children}</>;
}
