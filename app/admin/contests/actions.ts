"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface ActionResult {
  ok: boolean;
  message: string;
  contestId?: string;
  warning?: string;
}

// Caller must be an active admin of the contest. Never trust the client:
// every write below additionally passes RLS + freeze triggers as the user.
async function adminOf(contestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Not signed in." };
  const { data } = await supabase
    .from("judges")
    .select("is_admin,is_active")
    .eq("user_id", user.id)
    .eq("contest_id", contestId);
  const rows = (data ?? []) as { is_admin: boolean; is_active: boolean }[];
  if (!rows.some((r) => r.is_admin && r.is_active)) {
    return { supabase, user, error: "Admins only." };
  }
  return { supabase, user, error: null as string | null };
}

function frozenMessage(err: unknown, fallback: string): string {
  const m = String((err as { message?: string })?.message ?? err);
  if (/open or locked|cannot be (added|removed|modified|moved)|numbers cannot|locked/i.test(m)) {
    return "Frozen — structure can't change once a contest is open.";
  }
  return m || fallback;
}

async function contestOf(supabase: Client, table: "contestants" | "criteria", id: string) {
  const { data } = await supabase
    .from(table)
    .select("id,contest_id")
    .eq("id", id)
    .maybeSingle();
  return (data as { id: string; contest_id: string } | null)?.contest_id ?? null;
}

export async function createContest(name: string): Promise<ActionResult> {
  const clean = name.trim();
  if (!clean) return { ok: false, message: "Enter a contest name." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const { data, error } = await supabase.rpc("create_contest", { p_name: clean });
  if (error) {
    const denied = /only existing admins/i.test(error.message);
    return {
      ok: false,
      message: denied ? "Only existing admins can create contests." : error.message,
    };
  }
  revalidatePath("/admin/contests");
  return { ok: true, message: "Contest created.", contestId: data as string };
}

export async function addContestant(
  contestId: string,
  name: string
): Promise<ActionResult> {
  const clean = name.trim();
  if (!clean) return { ok: false, message: "Enter a name." };
  const { supabase, error } = await adminOf(contestId);
  if (error) return { ok: false, message: error };
  const { data: last } = await supabase
    .from("contestants")
    .select("number")
    .eq("contest_id", contestId)
    .order("number", { ascending: false })
    .limit(1);
  const next = (((last ?? []) as { number: number }[])[0]?.number ?? 0) + 1;
  const { error: ins } = await supabase
    .from("contestants")
    .insert({ contest_id: contestId, name: clean, number: next });
  if (ins) return { ok: false, message: frozenMessage(ins, "Add failed.") };
  revalidatePath(`/admin/contests/${contestId}`);
  return { ok: true, message: `Added ${clean} (#${next}).` };
}

export async function bulkAddContestants(
  contestId: string,
  names: string[]
): Promise<ActionResult> {
  const clean = names.map((n) => n.trim()).filter(Boolean).slice(0, 200);
  if (clean.length === 0) return { ok: false, message: "Paste at least one name." };
  const { supabase, error } = await adminOf(contestId);
  if (error) return { ok: false, message: error };
  const { data: last } = await supabase
    .from("contestants")
    .select("number")
    .eq("contest_id", contestId)
    .order("number", { ascending: false })
    .limit(1);
  let next = (((last ?? []) as { number: number }[])[0]?.number ?? 0) + 1;
  const rows = clean.map((name) => ({ contest_id: contestId, name, number: next++ }));
  const { error: ins } = await supabase.from("contestants").insert(rows);
  if (ins) return { ok: false, message: frozenMessage(ins, "Bulk add failed.") };
  revalidatePath(`/admin/contests/${contestId}`);
  return { ok: true, message: `Added ${rows.length} contestants.` };
}

export async function updateContestant(
  contestantId: string,
  patch: { name?: string; number?: number; photo_url?: string | null }
): Promise<ActionResult> {
  const supabase = await createClient();
  const cid = await contestOf(supabase, "contestants", contestantId);
  if (!cid) return { ok: false, message: "Contestant not found." };
  const admin = await adminOf(cid);
  if (admin.error) return { ok: false, message: admin.error };
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { ok: false, message: "Name can't be blank." };
    clean.name = patch.name.trim();
  }
  if (patch.number !== undefined) {
    if (!Number.isInteger(patch.number) || patch.number < 1) {
      return { ok: false, message: "Number must be a positive integer." };
    }
    clean.number = patch.number;
  }
  if (patch.photo_url !== undefined) clean.photo_url = patch.photo_url;
  const { data, error } = await supabase
    .from("contestants")
    .update(clean)
    .eq("id", contestantId)
    .select("id");
  if (error) return { ok: false, message: frozenMessage(error, "Update failed.") };
  if (!data || data.length === 0) {
    return { ok: false, message: "Not allowed in this contest status." };
  }
  revalidatePath(`/admin/contests/${cid}`);
  revalidatePath("/admin");
  return { ok: true, message: "Saved." };
}

export async function deleteContestant(contestantId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const cid = await contestOf(supabase, "contestants", contestantId);
  if (!cid) return { ok: false, message: "Contestant not found." };
  const admin = await adminOf(cid);
  if (admin.error) return { ok: false, message: admin.error };
  const { data, error } = await supabase
    .from("contestants")
    .delete()
    .eq("id", contestantId)
    .select("id");
  if (error) return { ok: false, message: frozenMessage(error, "Delete failed.") };
  if (!data || data.length === 0) {
    return { ok: false, message: "Only draft contestants can be deleted." };
  }
  revalidatePath(`/admin/contests/${cid}`);
  return { ok: true, message: "Deleted." };
}

export async function addCriterion(
  contestId: string,
  name: string,
  weight: number
): Promise<ActionResult> {
  const clean = name.trim();
  const w = Number(weight);
  if (!clean) return { ok: false, message: "Enter a name." };
  if (!Number.isFinite(w) || w <= 0) {
    return { ok: false, message: "Weight must be greater than 0." };
  }
  const { supabase, error } = await adminOf(contestId);
  if (error) return { ok: false, message: error };
  const { error: ins } = await supabase
    .from("criteria")
    .insert({ contest_id: contestId, name: clean, weight: w });
  if (ins) return { ok: false, message: frozenMessage(ins, "Add failed.") };
  revalidatePath(`/admin/contests/${contestId}`);
  return { ok: true, message: `Added ${clean}.` };
}

export async function updateCriterion(
  criterionId: string,
  patch: { name?: string; weight?: number }
): Promise<ActionResult> {
  const supabase = await createClient();
  const cid = await contestOf(supabase, "criteria", criterionId);
  if (!cid) return { ok: false, message: "Criterion not found." };
  const admin = await adminOf(cid);
  if (admin.error) return { ok: false, message: admin.error };
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { ok: false, message: "Name can't be blank." };
    clean.name = patch.name.trim();
  }
  if (patch.weight !== undefined) {
    const w = Number(patch.weight);
    if (!Number.isFinite(w) || w <= 0) {
      return { ok: false, message: "Weight must be greater than 0." };
    }
    clean.weight = w;
  }
  const { data, error } = await supabase
    .from("criteria")
    .update(clean)
    .eq("id", criterionId)
    .select("id");
  if (error) return { ok: false, message: frozenMessage(error, "Update failed.") };
  if (!data || data.length === 0) {
    return { ok: false, message: "Not allowed in this contest status." };
  }
  revalidatePath(`/admin/contests/${cid}`);
  return { ok: true, message: "Saved." };
}

export async function deleteCriterion(criterionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const cid = await contestOf(supabase, "criteria", criterionId);
  if (!cid) return { ok: false, message: "Criterion not found." };
  const admin = await adminOf(cid);
  if (admin.error) return { ok: false, message: admin.error };
  const { data, error } = await supabase
    .from("criteria")
    .delete()
    .eq("id", criterionId)
    .select("id");
  if (error) return { ok: false, message: frozenMessage(error, "Delete failed.") };
  if (!data || data.length === 0) {
    return { ok: false, message: "Only draft criteria can be deleted." };
  }
  revalidatePath(`/admin/contests/${cid}`);
  return { ok: true, message: "Deleted." };
}

export async function setTrimmed(contestId: string, value: boolean): Promise<ActionResult> {
  const { supabase, error } = await adminOf(contestId);
  if (error) return { ok: false, message: error };
  const { error: upd } = await supabase
    .from("contests")
    .update({ use_trimmed_average: value })
    .eq("id", contestId);
  if (upd) return { ok: false, message: frozenMessage(upd, "Update failed.") };
  revalidatePath(`/admin/contests/${contestId}`);
  revalidatePath("/admin");
  return { ok: true, message: value ? "Trimmed average on." : "Trimmed average off." };
}

export async function openContestAction(contestId: string): Promise<ActionResult> {
  const { supabase, error } = await adminOf(contestId);
  if (error) return { ok: false, message: error };
  const { data, error: rpcError } = await supabase.rpc("open_contest", {
    p_contest_id: contestId,
  });
  if (rpcError) {
    const m = rpcError.message;
    if (/cannot open contest/i.test(m)) return { ok: false, message: m };
    return { ok: false, message: m };
  }
  const res = data as { ok: boolean; warning?: string };
  revalidatePath(`/admin/contests/${contestId}`);
  revalidatePath("/admin");
  return {
    ok: true,
    message: res.warning ?? "Contest is open for judging.",
    warning: res.warning,
  };
}

export async function deleteContestAction(
  contestId: string,
  typedName: string
): Promise<ActionResult> {
  const { supabase, error } = await adminOf(contestId);
  if (error) return { ok: false, message: error };
  const { data: contest } = await supabase
    .from("contests")
    .select("id,name")
    .eq("id", contestId)
    .maybeSingle();
  const row = contest as { id: string; name: string } | null;
  if (!row) return { ok: false, message: "Contest not found." };
  if (typedName.trim() !== row.name) {
    return { ok: false, message: "Name doesn't match." };
  }
  const { data, error: del } = await supabase
    .from("contests")
    .delete()
    .eq("id", contestId)
    .select("id");
  if (del) return { ok: false, message: del.message };
  if (!data || data.length === 0) {
    return { ok: false, message: "Only empty drafts can be deleted." };
  }
  revalidatePath("/admin/contests");
  return { ok: true, message: "Contest deleted." };
}
