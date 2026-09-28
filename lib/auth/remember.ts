// "Remember me" (2026-09-27). Pure, shared by the server and the browser.
//
// Supabase's cookie helper always writes a 400-day Max-Age. When a curator
// signs in with "Remember me" off, a marker cookie (itself a session
// cookie) is set, and every auth cookie written while it's present has its
// Max-Age and Expires dropped, so the browser forgets the whole sign-in
// when it closes. The extension follows the same choice: it keeps its
// session in storage that is cleared with the browser.

export const SESSION_ONLY_COOKIE = "04am-session-only";

type Lifetime = { maxAge?: number; expires?: Date | number | string };

/** A cookie's options, made to last only as long as the browser session.
 * Removals (Max-Age 0) are left alone: they still have to remove. */
export function sessionOnly<T extends Lifetime>(options: T): T {
  if (options.maxAge === 0) return options;
  const out = { ...options };
  delete out.maxAge;
  delete out.expires;
  return out;
}
