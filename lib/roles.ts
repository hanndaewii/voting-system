import type { SupabaseClient } from "@supabase/supabase-js";

export type Role = "admin" | "judge" | "none";

interface JudgeRow {
  is_admin: boolean;
  is_active: boolean;
}

export async function getRole(
  supabase: SupabaseClient,
  userId: string
): Promise<Role> {
  const { data } = await supabase
    .from("judges")
    .select("is_admin,is_active")
    .eq("user_id", userId);
  const rows = (data ?? []) as JudgeRow[];
  if (rows.some((j) => j.is_admin && j.is_active)) return "admin";
  if (rows.some((j) => j.is_active && !j.is_admin)) return "judge";
  return "none";
}
