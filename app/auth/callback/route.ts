import { NextResponse, type NextRequest } from "next/server";
import { authServerClient } from "@/lib/supabase/auth-server";
import { ENTERED_COOKIE } from "@/lib/intro";
import { safeNext } from "@/lib/auth/next";

// Where emailed links land: confirming a new account, or resetting a
// password (?next=/reset-password). Exchanges the one-time code for a
// session, marks the intro as seen, and sends the person on.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/signin?link=invalid", url.origin));
  }

  const supabase = await authServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/signin?link=expired", url.origin));
  }

  const res = NextResponse.redirect(new URL(next, url.origin));
  res.cookies.set(ENTERED_COOKIE, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  return res;
}
