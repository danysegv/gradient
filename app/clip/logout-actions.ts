"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CLIP_SESSION_COOKIE } from "@/lib/clip-auth";
import { authServerClient } from "@/lib/supabase/auth-server";

// The counterpart to loginToClipper. Until 2026-09-03 there was no way out
// of a clipper session at all: the cookie was set with a 30-day maxAge and
// nothing ever cleared it, so switching curators meant a private window or
// deleting an httpOnly cookie by hand in devtools. That was tolerable with
// two curators on two machines and stopped being tolerable at three.
//
// Deleting the cookie is the whole logout. There is no server-side session
// to invalidate — the cookie IS the proof, a hash derived from that
// curator's secret — so nothing outlives it. Rotating a curator's secret in
// CLIP_CURATORS remains the way to invalidate a session you cannot reach.
//
// Since 2026-09-21 a curator may be signed in with an account instead, so
// signing out ends both: the account session and the old password cookie.
export async function logoutFromClipper(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CLIP_SESSION_COOKIE);
  try {
    await (await authServerClient()).auth.signOut();
  } catch {
    // no account session to end
  }
  redirect("/");
}
