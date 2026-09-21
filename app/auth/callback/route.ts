import { NextResponse, type NextRequest } from "next/server";
import { authServerClient } from "@/lib/supabase/auth-server";
import { ENTERED_COOKIE } from "@/lib/intro";

// Where the emailed sign-in link lands. Exchanges the one-time code for a
// session (the cookies are set by the Supabase client), marks the intro as
// seen, and sends the visitor into the library.
//
// A bad or expired link goes back to the intro's sign-up with a flag, so
// the page can say "that link expired" instead of failing silently.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const home = new URL("/", url.origin);

  if (!code) {
    return NextResponse.redirect(new URL("/?intro&link=invalid#join", url.origin));
  }

  const supabase = await authServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/?intro&link=expired#join", url.origin));
  }

  const res = NextResponse.redirect(home);
  res.cookies.set(ENTERED_COOKIE, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  return res;
}
