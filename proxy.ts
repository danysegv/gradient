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

export const config = {
  matcher: ["/clip", "/clip/:path*"],
};
