// The "Clip from anywhere" card on /clip (Daniela, 2026-09-28).
//
// Every curator sees it, every time they sign in — installed or not. "Hide
// this" puts it away for the rest of that sign-in only: the cookie records
// WHICH sign-in hid it, so a new sign-in shows it again even if the cookie
// is still there, and signing out deletes it anyway.
//
// Pure, so the rule is tested rather than assumed.

export const CLIPPER_CARD_COOKIE = "04am_clipper_card_hidden";

/** One value per sign-in: the account session, or the legacy password login. */
export function cardKey(session: { sessionId?: string; loginKey: string }): string {
  return session.sessionId ? `s:${session.sessionId}` : `pw:${session.loginKey}`;
}

export function cardHidden(
  cookieValue: string | undefined,
  session: { sessionId?: string; loginKey: string }
): boolean {
  return cookieValue !== undefined && cookieValue === cardKey(session);
}
