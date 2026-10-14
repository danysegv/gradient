// Password rules, kept short and honest: length is what matters. The upper
// bound is bcrypt's 72-byte limit, past which extra characters are ignored.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export type PasswordCheck = { ok: true; value: string } | { ok: false; error: string };

/** A new password and its confirmation, checked together. The match is
 * checked on the server too — the form's own check is only a courtesy. */
export function parseNewPassword(raw: unknown, confirm: unknown): PasswordCheck {
  const password = parsePassword(raw);
  if (!password.ok) return password;
  if (typeof confirm !== "string" || confirm.length === 0) {
    return { ok: false, error: "Confirm your password." };
  }
  if (confirm !== password.value) {
    return { ok: false, error: "The passwords don't match." };
  }
  return password;
}

// What a new password must contain (Daniela, 2026-10-14). Supabase is set
// to the same rule (Auth → Email → "Lowercase, uppercase letters, digits
// and symbols"), so it holds even for someone who skips the site. The
// symbol list is Supabase's own, character for character, so the two can
// never disagree about what counts.
export const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

const RULES: [test: (pw: string) => boolean, missing: string][] = [
  [(pw) => /[a-z]/.test(pw), "a lowercase letter"],
  [(pw) => /[A-Z]/.test(pw), "an uppercase letter"],
  [(pw) => /[0-9]/.test(pw), "a number"],
  [(pw) => [...pw].some((c) => PASSWORD_SYMBOLS.includes(c)), "a symbol"],
];

/** What a new password still lacks, in plain words; empty when it passes. */
export function passwordMissing(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < PASSWORD_MIN) out.push(`${PASSWORD_MIN}+ characters`);
  for (const [ok, missing] of RULES) if (!ok(pw)) out.push(missing);
  return out;
}

/** "Add a number and a symbol." */
export function missingSentence(missing: string[]): string {
  if (missing.length === 0) return "";
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Add ${list}.`;
}

export function parsePassword(raw: unknown): PasswordCheck {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: "Enter a password." };
  }
  if (raw.length < PASSWORD_MIN) {
    return { ok: false, error: `At least ${PASSWORD_MIN} characters.` };
  }
  const missing = passwordMissing(raw);
  if (missing.length > 0) return { ok: false, error: missingSentence(missing) };
  if (new TextEncoder().encode(raw).length > PASSWORD_MAX) {
    return { ok: false, error: "That password is too long." };
  }
  return { ok: true, value: raw };
}
