// The first-visit intro on `/` (opening → how it works → sign-up).
//
// Having seen it is remembered in one cookie, set only by the intro's own
// server action (app/intro-actions.ts) and read by app/page.tsx. Sign-up is
// UI ONLY for now (decided 2026-09-19): the form does not store or send the
// email anywhere. Real accounts are a separate, load-bearing build — see the
// legal note in CLAUDE.md on §512(i) — not something to slip in here.
export const ENTERED_COOKIE = "04am_entered";

/** "AnalogNoise" → "Analog Noise". Display only. */
export function spaceTagName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}
