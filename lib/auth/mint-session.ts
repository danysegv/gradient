import "server-only";
import { createClient, type Session } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

// A second, independent sign-in for an account that is already signed in
// somewhere we trust — the site's cookie session, or the extension's
// token, each verified by lib/clip-session.ts before this is called.
//
// Each side gets its OWN session (own refresh token) rather than a copy of
// the other's: Supabase rotates refresh tokens, so two holders of one
// token would sign each other out on their next refresh.
//
// How: the admin API issues a one-time magic-link token (no email is
// sent), which is exchanged straight away for a session.
export async function mintSession(userId: string): Promise<Session | null> {
  try {
    const { data: found } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = found.user?.email;
    if (!email) return null;
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (error || !tokenHash) return null;
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
    const { data, error: verifyError } = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (verifyError || !data.session || data.session.user.id !== userId) return null;
    return data.session;
  } catch {
    return null;
  }
}

/** The session id inside an access token THIS SERVER just minted. Never
 * used to trust a token from outside — those go through lib/clip-session.ts. */
export function sessionIdOfMinted(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")
    ) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}
