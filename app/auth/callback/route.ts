import { NextResponse, type NextRequest } from "next/server";

// Legacy entry point for emailed links. NEVER exchanges tokens here:
// email scanners open links before the human does, which would burn the
// one-time token. Just forwards everything to /auth/confirm, where a
// human click performs the exchange.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next");

  if (!code && !(token_hash && type)) {
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  const dest = new URL("/auth/confirm", request.url);
  if (code) dest.searchParams.set("code", code);
  if (token_hash) dest.searchParams.set("token_hash", token_hash);
  if (type) dest.searchParams.set("type", type);
  if (next) dest.searchParams.set("next", next);
  return NextResponse.redirect(dest);
}
