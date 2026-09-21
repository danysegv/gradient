import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CLIP_SESSION_COOKIE, isValidSessionToken } from "@/lib/clip-auth";

// Gates the private clipper. Optimistic check only (cookie read, no DB) —
// the /clip page and every clipper Server Action re-verify independently
// through lib/clip-session.ts, per Next's guidance that Server Actions are
// reachable via direct POST and must not rely on Proxy alone.
//
// Two ways past it since 2026-09-21: an account session cookie (Supabase
// Auth, "sb-…-auth-token"), or the old per-curator password cookie. Which
// accounts are curators is decided by the page, not here — a signed-in
// visitor who isn't one gets a plain "not a curator yet" page.
export function proxy(request: NextRequest) {
  const legacy = request.cookies.get(CLIP_SESSION_COOKIE)?.value;
  const hasAccount = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  if (!hasAccount && !isValidSessionToken(legacy)) {
    return NextResponse.redirect(new URL("/signin?next=/clip", request.url));
  }

  return NextResponse.next();
}

// Exactly "/clip" — nothing beneath it. /clip/<uuid> is the PUBLIC clip
// detail page (a sibling of the clipper, not a child). The old
// "/clip/:path*" entry put every clip page behind the password form, so
// from 2026-09-04 to 2026-09-11 every tile on the public grid led a
// signed-out visitor to a login screen. /clip also re-checks the session
// in its own page component, so this matcher is not the only gate.
export const config = {
  matcher: ["/clip"],
};
