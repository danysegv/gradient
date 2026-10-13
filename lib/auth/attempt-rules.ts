// How many sign-in, sign-up and reset attempts a person gets (security
// review 2026-10-13, finding #5). Pure, so it is tested.
//
// Why the app counts at all: every one of these doors calls Supabase from
// OUR server, so Supabase's own per-IP limits see Vercel's address, not
// the person's. Without a count here, one script could try passwords
// against an account for as long as it liked. Someone who skips the site
// and calls Supabase directly is still counted by Supabase, by their own
// address, so between the two every route has a limit.
//
// Every attempt counts, right or wrong; a person signing in normally never
// comes near these. Nothing raw is stored: an address or email becomes a
// short hash before it reaches the database.

import { createHash } from "node:crypto";

export type AttemptRule = { bucket: string; max: number; windowSeconds: number };

const MIN = 60;
const HOUR = 60 * MIN;

export const LIMITS = {
  signInPerIp: { max: 20, windowSeconds: 10 * MIN },
  signInPerEmail: { max: 8, windowSeconds: 15 * MIN },
  signUpPerIp: { max: 5, windowSeconds: HOUR },
  resetPerIp: { max: 5, windowSeconds: HOUR },
  resetPerEmail: { max: 3, windowSeconds: HOUR },
  // The old curator password (/clip-login): one shared secret per curator,
  // so the tightest of all.
  curatorPasswordPerIp: { max: 10, windowSeconds: 15 * MIN },
} as const;

export type LimitName = keyof typeof LIMITS;

export const TOO_MANY = "Too many attempts just now. Try again in a few minutes.";

/** A short, one-way name for a value, so no address or email is stored. */
export function hashed(value: string): string {
  return createHash("sha256").update(`04am-attempt:${value}`).digest("hex").slice(0, 32);
}

/** The rule for one limit applied to one value (an IP or an email). */
export function rule(name: LimitName, value: string): AttemptRule {
  return { bucket: `${name}:${hashed(value.trim().toLowerCase())}`, ...LIMITS[name] };
}

/**
 * The visitor's address as Vercel reports it. Vercel sets x-real-ip and
 * overwrites x-forwarded-for itself, so a visitor can't choose either.
 * Null when neither is there (local dev), and then no per-IP rule applies.
 */
export function clientIp(get: (name: string) => string | null): string | null {
  const real = get("x-real-ip")?.trim();
  if (real) return real;
  const first = get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || null;
}
