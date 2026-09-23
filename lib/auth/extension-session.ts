import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSessionForToken, type SessionCurator } from "@/lib/clip-session";

// Signing the browser extension in (2026-09-23). Same account system as
// the site — email + password through Supabase Auth — but the session is
// handed back as tokens instead of cookies, because the extension keeps it
// in its own storage and sends it as a bearer header.
//
// Only curators get tokens. A signed-in account that isn't linked to a
// curator profile is signed straight back out, so the extension never
// holds a session that can't clip.

export type ExtensionSession = {
  access_token: string;
  refresh_token: string;
  /** Unix seconds. */
  expires_at: number;
  curator: { name: string; isAdmin: boolean };
};

export type ExtensionSessionResult =
  | { ok: true; session: ExtensionSession }
  | { ok: false; status: number; error: string; code: "invalid" | "not_curator" | "rate_limited" | "unconfirmed" | "failed" };

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

function failure(err: { message: string; status?: number; code?: string }): ExtensionSessionResult {
  if (err.status === 429 || /rate/i.test(err.message)) {
    return { ok: false, status: 429, code: "rate_limited", error: "Too many attempts just now. Try again in a few minutes." };
  }
  if (err.code === "email_not_confirmed" || /not confirmed/i.test(err.message)) {
    return { ok: false, status: 401, code: "unconfirmed", error: "Confirm your email first — the link is in your inbox." };
  }
  if (err.code === "invalid_credentials" || /invalid login/i.test(err.message)) {
    return { ok: false, status: 401, code: "invalid", error: "That email and password don't match." };
  }
  if (/refresh token/i.test(err.message) || err.code === "refresh_token_not_found" || err.code === "refresh_token_already_used") {
    return { ok: false, status: 401, code: "invalid", error: "Signed out. Sign in again." };
  }
  return { ok: false, status: 502, code: "failed", error: "Something went wrong. Try again." };
}

async function asCurator(
  supabase: ReturnType<typeof client>,
  s: { access_token: string; refresh_token: string; expires_at?: number; expires_in: number }
): Promise<ExtensionSessionResult> {
  const curator: SessionCurator | null = await getSessionForToken(s.access_token);
  if (!curator) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    return {
      ok: false,
      status: 403,
      code: "not_curator",
      error: "This account isn't a curator yet. Ask Daniela to approve it on /clip/team.",
    };
  }
  return {
    ok: true,
    session: {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in,
      curator: { name: curator.name, isAdmin: curator.isAdmin },
    },
  };
}

export async function signInExtension(email: string, password: string): Promise<ExtensionSessionResult> {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return failure(error ?? { message: "no session" });
  return asCurator(supabase, data.session);
}

export async function refreshExtension(refreshToken: string): Promise<ExtensionSessionResult> {
  const supabase = client();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return failure(error ?? { message: "refresh token missing" });
  return asCurator(supabase, data.session);
}

/** Ends this one session (other devices stay signed in). Best-effort. */
export async function signOutExtension(accessToken: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    await supabaseAdmin.auth.admin.signOut(accessToken, "local");
  } catch {
    // The extension forgets its tokens either way.
  }
}
