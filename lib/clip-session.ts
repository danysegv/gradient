import "server-only";
import { cookies } from "next/headers";
import { CLIP_SESSION_COOKIE, sessionCurator } from "@/lib/clip-auth";

/**
 * The curator signed in through /clip-login, or null. Safe on public pages:
 * if CLIP_CURATORS is misconfigured, getCurators() throws — a public profile
 * must render for visitors regardless, so that reads as "nobody signed in".
 * Server actions still re-verify through this same function.
 */
export async function getSessionCurator(): Promise<string | null> {
  const store = await cookies();
  try {
    return sessionCurator(store.get(CLIP_SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}
