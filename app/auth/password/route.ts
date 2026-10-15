import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRole, type Role } from "@/lib/roles";

// Password login: no email round-trip. Shares the otp_rate_limit budget
// (table survives serverless instances). Generic errors only — never
// reveal whether the email exists or which field was wrong.
const EMAIL_LIMIT = 8;
const IP_LIMIT = 60;
const WINDOW_MINUTES = 10;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function roleHome(role: string): string {
  return role === "admin" ? "/admin" : role === "judge" ? "/judge" : "/no-access";
}

function safeReturnTo(returnTo: string | null, role: string): string {
  const home = roleHome(role);
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("\\")) {
    return home;
  }
  if (role === "admin" && returnTo.startsWith("/admin")) return returnTo;
  if (role === "judge" && returnTo.startsWith("/judge")) return returnTo;
  return home;
}

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string; returnTo?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!EMAIL_RE.test(email) || !password) {
    return NextResponse.json({ ok: false, message: "Invalid email or password." });
  }

  // Rate limit (service-side table).
  try {
    const admin = createAdminClient();
    const hdrs = await headers();
    const ip = (hdrs.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim().slice(0, 64);
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    await admin.from("otp_rate_limit").delete().lt("created_at", new Date(Date.now() - 3600 * 1000).toISOString());
    const { count: byEmail } = await admin
      .from("otp_rate_limit")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    const { count: byIp } = await admin
      .from("otp_rate_limit")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    if ((byEmail ?? 0) >= EMAIL_LIMIT || (byIp ?? 0) >= IP_LIMIT) {
      return NextResponse.json({ ok: false, message: "Too many attempts. Try again later." });
    }
    await admin.from("otp_rate_limit").insert({ email, ip });
  } catch {
    return NextResponse.json({ ok: false, message: "Couldn't sign in right now. Try again." });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ ok: false, message: "Invalid email or password." });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role: Role = user ? await getRole(supabase, user.id) : "none";
  return NextResponse.json({
    ok: true,
    redirect: safeReturnTo(body.returnTo ?? null, role),
  });
}
