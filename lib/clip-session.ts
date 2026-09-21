import "server-only";
import { cookies } from "next/headers";
import { CLIP_SESSION_COOKIE, sessionCurator } from "@/lib/clip-auth";
import { nameForLoginKey, getProfile } from "@/lib/profiles/queries";
import { authServerClient } from "@/lib/supabase/auth-server";

// THE ONE PLACE that decides who the curator on this request is. Every
// clipper page and action asks here; nothing else reads a session cookie.
// (Before 2026-09-21 four actions read the password cookie directly, which
// yields the stable login KEY rather than the current username — so after a
// rename, new clips would have been credited to the old name.)
//
// Two ways in, in this order:
//   1. an ACCOUNT (Supabase Auth, email + password) linked to a curator
//      profile by profiles.user_id — the way in from now on;
//   2. the old per-curator PASSWORD cookie (CLIP_CURATORS), kept as a
//      fallback until every curator has linked an account.
//
// Safe on public pages: any failure reads as "nobody signed in".

export type SessionCurator = {
  /** Current username — what clips are credited to. */
  name: string;
  /** Stable key that survives a rename. */
  loginKey: string;
  isAdmin: boolean;
  via: "account" | "password";
};

function hasAuthCookie(names: string[]): boolean {
  return names.some((n) => n.startsWith("sb-") && n.includes("-auth-token"));
}

export async function getSession(): Promise<SessionCurator | null> {
  const store = await cookies();

  // 1. Account. Skipped entirely when no auth cookie is present, so a
  // signed-out visitor costs no network call.
  if (hasAuthCookie(store.getAll().map((c) => c.name))) {
    try {
      const supabase = await authServerClient();
      const { data } = await supabase.rpc("my_curator_profile");
      const row = (data as { name: string; login_key: string; is_admin: boolean }[] | null)?.[0];
      if (row) {
        return { name: row.name, loginKey: row.login_key, isAdmin: row.is_admin, via: "account" };
      }
    } catch {
      // fall through to the password cookie
    }
  }

  // 2. Password cookie (legacy).
  let loginKey: string | null;
  try {
    loginKey = sessionCurator(store.get(CLIP_SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
  if (!loginKey) return null;
  try {
    const name = (await nameForLoginKey(loginKey)) ?? loginKey;
    const profile = await getProfile(name);
    return { name, loginKey, isAdmin: profile?.is_admin ?? false, via: "password" };
  } catch {
    // A profiles read that fails must not sign a curator out mid-session.
    return { name: loginKey, loginKey, isAdmin: false, via: "password" };
  }
}

/** The curator on this request, by current username, or null. */
export async function getSessionCurator(): Promise<string | null> {
  return (await getSession())?.name ?? null;
}

/** The stable key behind the session — for writes that must survive a
 * rename, such as the rename itself. */
export async function getSessionLoginKey(): Promise<string | null> {
  return (await getSession())?.loginKey ?? null;
}
