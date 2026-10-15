import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Thin by design: refresh the session, keep strangers out of protected
// paths, pass everything else through. Role routing + enforcement live
// in the pages (each one re-checks auth + role server-side), so there is
// no per-request role database query here.
export async function middleware(request: NextRequest) {
  let response: NextResponse;
  let user = null;
  try {
    const session = await updateSession(request);
    response = session.response;
    user = session.user;
  } catch (e) {
    // Failsafe: never 500 the whole site from middleware.
    console.error("middleware failed open (pages re-guard):", e);
    return NextResponse.next({ request });
  }

  const { pathname } = request.nextUrl;

  // Let the auth routes run untouched.
  if (pathname.startsWith("/auth/")) return response;

  if (
    !user &&
    (pathname === "/" ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/judge"))
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
