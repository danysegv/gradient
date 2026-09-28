import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

// One sign-in across the site and the extension (2026-09-27). When one
// side's session is made from the other's, the two are recorded as a pair
// (scripts/session-pairs.sql); signing out of either ends both.

export async function pairSessions(
  siteSession: string,
  extSession: string,
  userId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("session_pairs")
    .upsert({ site_session: siteSession, ext_session: extSession, user_id: userId });
  if (error) console.error(`[04am] could not pair sessions: ${error.message}`);
}

/** Ends every session paired with this one. Best-effort: a failure here
 * must never stop the sign-out that called it. */
export async function endPairedSessions(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  try {
    await supabaseAdmin.rpc("end_paired_sessions", { p_session: sessionId });
  } catch (err) {
    console.error(`[04am] could not end paired sessions: ${err instanceof Error ? err.message : String(err)}`);
  }
}
