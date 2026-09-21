// The first-visit intro on `/` (opening → how it works → sign-up).
//
// Having come in is remembered in one cookie, set when an emailed sign-in
// link is opened (app/auth/callback/route.ts) and read by app/page.tsx.
// Sign-up became a real account on 2026-09-21 (Supabase Auth, email link):
// see lib/supabase/auth-server.ts. That account is a visitor's; it is not
// the curator gate and grants no write access to anything.
export const ENTERED_COOKIE = "04am_entered";

/** "AnalogNoise" → "Analog Noise". Display only. */
export function spaceTagName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}
