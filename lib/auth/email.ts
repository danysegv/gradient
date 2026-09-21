// The one field sign-up asks for. Pure, so it's tested rather than assumed.

export type EmailCheck = { ok: true; value: string } | { ok: false; error: string };

// Deliberately loose: the real check is whether the link arrives. This only
// catches the typos a person would want caught before waiting for an email.
const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseEmail(raw: unknown): EmailCheck {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "Enter your email address." };
  }
  const value = raw.trim().toLowerCase();
  if (value.length > 320 || !SHAPE.test(value)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  return { ok: true, value };
}
