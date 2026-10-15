"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRole } from "@/lib/roles";

// Shared budget per 10 minutes, across link sends and code verifications.
// Supabase's own limits apply on top. Counters live in otp_rate_limit
// (database table, survives serverless instances — never in-memory).
// Venue math: 5 judges sharing one Wi-Fi ≈ 5 x (1 link + 2 code tries +
// 1 resend + retries) ≈ 25 attempts per 10 min worst case. The per-IP
// cap of 60 below leaves 2x headroom; per-email cap of 8 stops abuse
// without ever blocking a legit judge (a judge needs at most ~4).
const EMAIL_LIMIT = 8;
const IP_LIMIT = 60;
const WINDOW_MINUTES = 10;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function checkRateLimit(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim().slice(0, 64);
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  await admin
    .from("otp_rate_limit")
    .delete()
    .lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  const { count: byEmail } = await admin
    .from("otp_rate_limit")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);
  if ((byEmail ?? 0) >= EMAIL_LIMIT) {
    return "Too many attempts for this email. Try again later.";
  }
  const { count: byIp } = await admin
    .from("otp_rate_limit")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);
  if ((byIp ?? 0) >= IP_LIMIT) {
    return "Too many attempts from this network. Try again later.";
  }
  await admin.from("otp_rate_limit").insert({ email, ip });
  return null;
}

export interface LoginResult {
  ok: boolean;
  message: string;
  redirect?: string;
}

function roleHome(role: string): string {
  return role === "admin" ? "/admin" : role === "judge" ? "/judge" : "/no-access";
}

// returnTo supports post-login return (e.g. after a re-login prompt):
// relative paths inside the caller's own area only.
function safeReturnTo(returnTo: string | null, role: string): string {
  const home = roleHome(role);
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("\\")) {
    return home;
  }
  if (role === "admin" && returnTo.startsWith("/admin")) return returnTo;
  if (role === "judge" && returnTo.startsWith("/judge")) return returnTo;
  return home;
}

export async function requestLoginLink(
  email: string,
  origin: string,
  returnTo?: string | null
): Promise<LoginResult> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return { ok: false, message: "Enter a valid email." };
  const limited = await checkRateLimit(clean);
  if (limited) return { ok: false, message: limited };

  const supabase = await createClient();
  const redirectTo =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? `${origin}/auth/callback?next=${encodeURIComponent(returnTo)}`
      : `${origin}/auth/callback`;
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });
  if (error) {
    const invited = /sign ?up|not allowed|not authorized|not found/i.test(error.message);
    return {
      ok: false,
      message: invited
        ? "This email is not invited. Ask the admin for an invite."
        : error.message,
    };
  }
  return { ok: true, message: "sent" };
}

// 6-digit code fallback (the {{ .Token }} in the email): for judges whose
// one-time link was already used up (e.g. by an email scanner).
export async function verifyLoginCode(
  email: string,
  code: string,
  returnTo?: string | null
): Promise<LoginResult> {
  const clean = email.trim().toLowerCase();
  const token = code.trim();
  if (!EMAIL_RE.test(clean)) return { ok: false, message: "Enter a valid email." };
  if (!/^\d{6}$/.test(token)) return { ok: false, message: "Enter the 6-digit code." };
  const limited = await checkRateLimit(clean);
  if (limited) return { ok: false, message: limited };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: clean,
    token,
    type: "email",
  });
  if (error) {
    return { ok: false, message: "Invalid or expired code. Request a new link to get a fresh code." };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = user ? await getRole(supabase, user.id) : "none";
  return { ok: true, message: "signed in", redirect: safeReturnTo(returnTo ?? null, role) };
}
