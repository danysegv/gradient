// Refuses a new password that has already leaked (security review
// 2026-10-13, finding #5). Supabase's built-in check needs the Pro plan;
// this is the same check, done here, against the same source: Have I Been
// Pwned's Pwned Passwords range API.
//
// Private by construction (k-anonymity): only the first five characters of
// the password's SHA-1 leave this server. The service answers with every
// leaked hash sharing that prefix, and the match is made here.
//
// Fails open: if the service is slow or down, sign-up and reset carry on.

import { createHash } from "node:crypto";

const RANGE_API = "https://api.pwnedpasswords.com/range/";

export const BREACHED =
  "That password has appeared in a data breach, so it's easy to guess. Choose a different one.";

export function sha1Upper(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex").toUpperCase();
}

/** Whether a range response lists this suffix (with a non-zero count). */
export function rangeHasSuffix(body: string, suffix: string): boolean {
  const want = suffix.toUpperCase();
  for (const line of body.split("\n")) {
    const [s, count] = line.trim().split(":");
    if (s === want && Number(count) > 0) return true;
  }
  return false;
}

export async function isBreachedPassword(password: string): Promise<boolean> {
  const hash = sha1Upper(password);
  try {
    const res = await fetch(RANGE_API + hash.slice(0, 5), {
      headers: { "Add-Padding": "true", "User-Agent": "04AM-password-check" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    return rangeHasSuffix(await res.text(), hash.slice(5));
  } catch {
    return false;
  }
}
