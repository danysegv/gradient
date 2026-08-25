import { createHash, timingSafeEqual } from "node:crypto";

// Named-secret gate for the private /clip tool — still not a user account
// system. Two Supabase-Auth/magic-link attempts were tried and fully
// reverted (see CLAUDE.md) — do not reintroduce that. This is a shared
// secret per curator, nothing more: each curator gets their own entry in
// CLIP_CURATORS so rotating one secret doesn't sign the others out, and so
// clips/archives can be stamped with who did them.
export const CLIP_SESSION_COOKIE = "04am_clip_session";

// Placeholder name only used while CLIP_CURATORS is unset — see
// getCurators() below. Not meant for daily use once real curators are
// configured.
const FALLBACK_CURATOR_NAME = "curator";

type Curator = { name: string; secret: string };

let curatorsCache: Curator[] | null = null;

// Parsed once per process (module-level cache) from CLIP_CURATORS —
// "name:secret,name:secret" pairs. Falls back to the single unnamed
// CLIP_GATE_SECRET if CLIP_CURATORS isn't set yet, so switching env vars
// in Vercel/locally can never mid-deploy lock everyone out.
function getCurators(): Curator[] {
  if (curatorsCache) return curatorsCache;

  const raw = process.env.CLIP_CURATORS;
  if (raw) {
    const curators = raw.split(",").map((pair) => {
      const [name, secret] = pair.split(":").map((s) => s.trim());
      if (!name || !secret) {
        throw new Error(
          `Malformed CLIP_CURATORS entry (want "name:secret"): "${pair}"`
        );
      }
      return { name, secret };
    });
    curatorsCache = curators;
    return curators;
  }

  const legacy = process.env.CLIP_GATE_SECRET;
  if (legacy) {
    curatorsCache = [{ name: FALLBACK_CURATOR_NAME, secret: legacy }];
    return curatorsCache;
  }

  throw new Error(
    "Missing CLIP_CURATORS (or fallback CLIP_GATE_SECRET) environment variable"
  );
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Binds the curator's name into the hash (not just their secret) so a
// session token is never valid for any name other than the one it was
// issued for, even in the degenerate case of two curators sharing a secret.
function sessionHash(curator: Curator): string {
  return createHash("sha256")
    .update(`${curator.name}:${curator.secret}`)
    .digest("hex");
}

/**
 * Resolves a submitted password to the curator it belongs to, or null.
 * Every curator's secret is compared unconditionally — the loop never
 * returns early on a match — so the total time this takes doesn't depend
 * on which curator (or whether any) matched. Individual comparisons stay
 * constant-time via timingSafeEqual, same as before.
 */
export function resolveCurator(password: string): string | null {
  let matchedName: string | null = null;
  for (const curator of getCurators()) {
    const matches = constantTimeEquals(password, curator.secret);
    if (matches && matchedName === null) matchedName = curator.name;
  }
  return matchedName;
}

export function isValidPassword(password: string): boolean {
  return resolveCurator(password) !== null;
}

// The cookie stores "<name>.<hash>" — which curator, plus a hash proof
// derived from that curator's secret. Never the secret itself. Rotating
// curator A's secret changes what hash A's cookie needs to match, so only
// A gets signed out — curator B's cookie is validated independently
// against B's (unchanged) secret.
export function expectedSessionToken(curatorName: string): string {
  const curator = getCurators().find((c) => c.name === curatorName);
  if (!curator) {
    throw new Error(`Unknown curator: ${curatorName}`);
  }
  return `${curator.name}.${sessionHash(curator)}`;
}

/** The curator a session cookie belongs to, or null if it's missing, for
 * an unknown name, or doesn't match that curator's current secret. */
export function sessionCurator(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot === -1) return null;

  const name = token.slice(0, dot);
  const hash = token.slice(dot + 1);
  const curator = getCurators().find((c) => c.name === name);
  if (!curator) return null;

  return constantTimeEquals(hash, sessionHash(curator)) ? name : null;
}

export function isValidSessionToken(token: string | undefined): boolean {
  return sessionCurator(token) !== null;
}
