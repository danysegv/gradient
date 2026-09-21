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

export function parsePassword(raw: unknown): PasswordCheck {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: "Enter a password." };
  }
  if (raw.length < PASSWORD_MIN) {
    return { ok: false, error: `At least ${PASSWORD_MIN} characters.` };
  }
  if (new TextEncoder().encode(raw).length > PASSWORD_MAX) {
    return { ok: false, error: "That password is too long." };
  }
  return { ok: true, value: raw };
}
