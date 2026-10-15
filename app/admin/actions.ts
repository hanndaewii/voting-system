"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface InviteResult {
  ok: boolean;
  message: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function inviteJudge(formData: FormData): Promise<InviteResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const contestId = String(formData.get("contestId") ?? "").trim();
  const origin = String(formData.get("origin") ?? "").trim();

  if (!EMAIL_RE.test(email)) return { ok: false, message: "Enter a valid email." };
  if (!name) return { ok: false, message: "Enter the judge's name." };
  if (!contestId) return { ok: false, message: "Pick a contest." };

  // Caller must be an active admin OF THIS contest — never trust the client.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const { data: me } = await supabase
    .from("judges")
    .select("is_admin,is_active")
    .eq("user_id", user.id)
    .eq("contest_id", contestId);
  const rows = (me ?? []) as { is_admin: boolean; is_active: boolean }[];
  if (!rows.some((j) => j.is_admin && j.is_active)) {
    return { ok: false, message: "Admins only." };
  }

  const admin = createAdminClient();

  // Resolve the auth user: invite, or reuse the existing account when the
  // email is already registered (e.g. a judge from another contest).
  // createdHere tracks ownership: only delete on failure what WE created.
  let targetUserId: string;
  let createdHere = false;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: origin ? `${origin}/auth/callback` : undefined,
    data: { name },
  });
  if (error || !data.user) {
    if (!/already|registered|exists/i.test(error?.message ?? "")) {
      return { ok: false, message: `Invite failed: ${error?.message ?? "unknown error"}` };
    }
    const existingId = await findUserIdByEmail(admin, email);
    if (!existingId) {
      return { ok: false, message: `Invite failed: ${error?.message ?? "unknown error"}` };
    }
    targetUserId = existingId;
  } else {
    targetUserId = data.user.id;
    createdHere = true;
  }

  // Already on the roster? Don't duplicate, don't error confusingly.
  const { data: existing } = await admin
    .from("judges")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("contest_id", contestId)
    .maybeSingle();
  if (existing) {
    revalidatePath("/admin");
    return { ok: true, message: `${name} is already a judge of this contest.` };
  }

  // Attach the judge row. Retry once; on persistent failure delete ONLY
  // an account this invite created (never a pre-existing user).
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error: insertError } = await admin.from("judges").insert({
      user_id: targetUserId,
      contest_id: contestId,
      name,
      email,
      is_admin: false,
    });
    if (!insertError) {
      revalidatePath("/admin");
      return {
        ok: true,
        message: createdHere
          ? `Invite sent to ${email}.`
          : `${name} added to this contest (account already existed).`,
      };
    }
    if (attempt === 2) {
      if (createdHere) await admin.auth.admin.deleteUser(targetUserId);
      return {
        ok: false,
        message: createdHere
          ? `Judge record failed twice — invite rolled back: ${insertError.message}`
          : `Judge record failed twice: ${insertError.message}`,
      };
    }
  }
  return { ok: false, message: "Unexpected error." };
}

// Email -> auth user id via paginated admin list (no get-by-email API).
// Returns null when no account uses the address.
async function findUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string | null> {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email
    );
    if (hit) return hit.id;
    if (data.users.length < 100) return null;
    page += 1;
  }
}

export interface ToggleResult {
  ok: boolean;
  message: string;
}

interface JudgeTarget {
  id: string;
  user_id: string;
  name: string;
  is_admin: boolean;
  is_active: boolean;
  contest_id: string;
}

// Revoke/reactivate a judge (is_active toggle only — rows are never
// deleted). Runs as the caller, so RLS + the locked freeze both apply.
export async function toggleJudgeActive(
  judgeId: string,
  active: boolean
): Promise<ToggleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data: target } = await supabase
    .from("judges")
    .select("id,user_id,name,is_admin,is_active,contest_id")
    .eq("id", judgeId)
    .maybeSingle();
  const row = target as JudgeTarget | null;
  if (!row) return { ok: false, message: "Judge not found." };

  const { data: me } = await supabase
    .from("judges")
    .select("is_admin,is_active")
    .eq("user_id", user.id)
    .eq("contest_id", row.contest_id);
  const mine = (me ?? []) as { is_admin: boolean; is_active: boolean }[];
  if (!mine.some((j) => j.is_admin && j.is_active)) {
    return { ok: false, message: "Admins only." };
  }

  if (!active) {
    // Revoking: never an admin (which also protects the last admin —
    // admins can only be changed out-of-band), never yourself.
    if (row.is_admin) return { ok: false, message: "Admins cannot be revoked here." };
    if (row.user_id === user.id) return { ok: false, message: "You cannot revoke yourself." };
  }

  const { error } = await supabase
    .from("judges")
    .update({ is_active: active })
    .eq("id", judgeId);
  if (error) {
    const frozen = /locked|cannot be modified|policy/i.test(error.message);
    return {
      ok: false,
      message: frozen
        ? "Contest is locked — judges are frozen."
        : `Update failed: ${error.message}`,
    };
  }
  revalidatePath("/admin");
  return {
    ok: true,
    message: active ? `${row.name} reactivated.` : `${row.name} revoked.`,
  };
}

export interface LockResult {
  ok: boolean;
  message: string;
}
export async function lockContest(contestId: string): Promise<LockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data: me } = await supabase
    .from("judges")
    .select("is_admin,is_active")
    .eq("user_id", user.id)
    .eq("contest_id", contestId);
  const mine = (me ?? []) as { is_admin: boolean; is_active: boolean }[];
  if (!mine.some((j) => j.is_admin && j.is_active)) {
    return { ok: false, message: "Admins only." };
  }

  const { data: contest } = await supabase
    .from("contests")
    .select("id,status")
    .eq("id", contestId)
    .maybeSingle();
  const current = contest as { id: string; status: string } | null;
  if (!current) return { ok: false, message: "Contest not found." };
  if (current.status !== "open") {
    return { ok: false, message: `Only open contests can be locked (now ${current.status}).` };
  }

  const { error } = await supabase
    .from("contests")
    .update({ status: "locked" })
    .eq("id", contestId);
  if (error) return { ok: false, message: `Lock failed: ${error.message}` };

  revalidatePath("/admin");
  return { ok: true, message: "Contest locked. Results are final." };
}

const RESEND_WINDOW_MINUTES = 10;
const RESEND_LIMIT = 3;

// Send a judge a fresh magic link. Admin-only, rate-limited (3 per email
// per 10 min), and the link itself is never revealed — only a status.
export async function resendJudgeLink(
  judgeId: string,
  origin: string,
  emailOverride?: string
): Promise<InviteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data: target } = await supabase
    .from("judges")
    .select("id,contest_id,name,email")
    .eq("id", judgeId)
    .maybeSingle();
  const row = target as {
    id: string;
    contest_id: string;
    name: string;
    email: string | null;
  } | null;
  if (!row) return { ok: false, message: "Judge not found." };

  const { data: me } = await supabase
    .from("judges")
    .select("is_admin,is_active")
    .eq("user_id", user.id)
    .eq("contest_id", row.contest_id);
  const mine = (me ?? []) as { is_admin: boolean; is_active: boolean }[];
  if (!mine.some((j) => j.is_admin && j.is_active)) {
    return { ok: false, message: "Admins only." };
  }

  const email = (emailOverride?.trim() || row.email || "").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: "No email on file — type the judge's email." };
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - RESEND_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await admin
    .from("magic_link_resends")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);
  if ((count ?? 0) >= RESEND_LIMIT) {
    return { ok: false, message: "Too many resends for this email. Try again later." };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: false,
    },
  });
  if (error) return { ok: false, message: `Resend failed: ${error.message}` };

  await admin.from("magic_link_resends").insert({
    contest_id: row.contest_id,
    email,
    created_by: user.id,
  });
  return { ok: true, message: `New link sent to ${email}.` };
}
