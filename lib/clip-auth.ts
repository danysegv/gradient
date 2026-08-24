import { createHash, timingSafeEqual } from "node:crypto";

// Shared secret gate for the private /clip tool — not a user account system.
// See CLAUDE.md: the clipper is a personal intake tool, not a public feature.
export const CLIP_SESSION_COOKIE = "04am_clip_session";

function getSecret(): string {
  const secret = process.env.CLIP_GATE_SECRET;
  if (!secret) {
    throw new Error("Missing CLIP_GATE_SECRET environment variable");
  }
  return secret;
}

// The cookie stores a hash of the secret, not the secret itself.
export function expectedSessionToken(): string {
  return createHash("sha256").update(getSecret()).digest("hex");
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isValidPassword(password: string): boolean {
  return constantTimeEquals(password, getSecret());
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  return constantTimeEquals(token, expectedSessionToken());
}
