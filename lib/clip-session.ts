import "server-only";
import { cookies } from "next/headers";
import { CLIP_SESSION_COOKIE, sessionCurator } from "@/lib/clip-auth";
import { nameForLoginKey } from "@/lib/profiles/queries";

/**
 * The curator signed in through /clip-login, or null. Safe on public pages:
 * if CLIP_CURATORS is misconfigured, getCurators() throws — a public profile
 * must render for visitors regardless, so that reads as "nobody signed in".
 * Server actions still re-verify through this same function.
 */
export async function getSessionCurator(): Promise<string | null> {
  const store = await cookies();
  let loginKey: string | null;
  try {
    loginKey = sessionCurator(store.get(CLIP_SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
  if (!loginKey) return null;
  // The cookie is keyed to the STABLE login key (the name in CLIP_CURATORS),
  // which is why a rename doesn't sign anyone out. What the rest of the app
  // wants is the name they go by now.
  try {
    return (await nameForLoginKey(loginKey)) ?? loginKey;
  } catch {
    // A profiles read that fails must not sign a curator out mid-session.
    return loginKey;
  }
}

/** The stable key behind the session — for writes that must survive a
 * rename, such as the rename itself. */
export async function getSessionLoginKey(): Promise<string | null> {
  const store = await cookies();
  try {
    return sessionCurator(store.get(CLIP_SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}
