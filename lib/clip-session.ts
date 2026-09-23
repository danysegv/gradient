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

// ---------------------------------------------------------------------
// 3. A BEARER TOKEN — the browser extension (2026-09-23).
//
// An extension can't rely on the site's cookies (Safari partitions them,
// and a content script runs on someone else's page), so it holds the
// account's own Supabase access token and sends it as
// `Authorization: Bearer …`. Accounts only: the legacy password has no
// token, so Igor and Verona use the extension once their accounts are
// linked. Kept in this file on purpose — it is still the one door.
// ---------------------------------------------------------------------

/** The token from an `Authorization: Bearer …` header, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(header.trim());
  return match ? match[1] : null;
}

/** The curator behind an account access token, or null. Validated by
 * Supabase (the RPC runs as that user), never decoded and trusted here. */
export async function getSessionForToken(token: string): Promise<SessionCurator | null> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );
    const { data, error } = await supabase.rpc("my_curator_profile");
    if (error) return null;
    const row = (data as { name: string; login_key: string; is_admin: boolean }[] | null)?.[0];
    if (!row) return null;
    return { name: row.name, loginKey: row.login_key, isAdmin: row.is_admin, via: "account" };
  } catch {
    return null;
  }
}

/** The curator on an extension request, or null. */
export async function getBearerSession(request: Request): Promise<SessionCurator | null> {
  const token = bearerToken(request);
  return token ? getSessionForToken(token) : null;
}
