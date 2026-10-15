import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { getRole } from "@/lib/roles";

export async function middleware(request: NextRequest) {
  try {
    return await gated(request);
  } catch (e) {
    // Failsafe: never 500 the whole site from middleware. Every protected
    // page re-checks auth + role server-side and redirects itself, so
    // falling through here is safe. The error lands in Vercel logs.
    console.error("middleware failed open (pages re-guard):", e);
    return NextResponse.next({ request });
  }
}

async function gated(request: NextRequest) {
  const { response, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Let the callback route exchange codes/tokens untouched.
  if (pathname.startsWith("/auth/")) return response;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (
      pathname === "/" ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/judge")
    ) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  if (pathname === "/" || pathname === "/login") {
    const role = await getRole(supabase, user.id);
    const dest =
      role === "admin" ? "/admin" : role === "judge" ? "/judge" : "/no-access";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (pathname.startsWith("/admin")) {
    const role = await getRole(supabase, user.id);
    if (role !== "admin") {
      const dest = role === "judge" ? "/judge" : "/no-access";
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  if (pathname.startsWith("/judge")) {
    const role = await getRole(supabase, user.id);
    if (role !== "judge") {
      const dest = role === "admin" ? "/admin" : "/no-access";
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
