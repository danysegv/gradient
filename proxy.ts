import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CLIP_SESSION_COOKIE, isValidSessionToken } from "@/lib/clip-auth";

// Gates the private clipper. Optimistic check only (cookie read, no DB) —
// the /clip Server Action re-verifies independently, per Next's guidance
// that Server Actions are reachable via direct POST and must not rely on
// Proxy alone.
export function proxy(request: NextRequest) {
  const token = request.cookies.get(CLIP_SESSION_COOKIE)?.value;

  if (!isValidSessionToken(token)) {
    return NextResponse.redirect(new URL("/clip-login", request.url));
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
