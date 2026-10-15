import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getRole, type Role } from "@/lib/roles";

// The exchange happens ONLY here, on human click (POST from the confirm
// page) — never on page load. Returns JSON; the client navigates.
export async function POST(request: NextRequest) {
  let body: {
    code?: string | null;
    token_hash?: string | null;
    type?: string | null;
    next?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }

  const { code, token_hash, type, next } = body;
  if (!code && !(token_hash && type)) {
    return NextResponse.json({ ok: false, message: "That link is invalid or expired." });
  }

  const supabase = await createClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        type: type as EmailOtpType,
        token_hash: token_hash as string,
      });
  if (error) {
    return NextResponse.json({ ok: false, message: "That link is invalid or expired." });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role: Role = user ? await getRole(supabase, user.id) : "none";
  return NextResponse.json({ ok: true, redirect: safeNext(next ?? null, role) });
}

// Open-redirect guard: only relative paths inside the caller's own area.
function safeNext(next: string | null, role: Role): string {
  const home = role === "admin" ? "/admin" : role === "judge" ? "/judge" : "/no-access";
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return home;
  }
  if (role === "admin" && next.startsWith("/admin")) return next;
  if (role === "judge" && next.startsWith("/judge")) return next;
  return home;
}
