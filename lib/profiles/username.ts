// Usernames, and the rules for changing one.
//
// A username is not a label: it is the credit stored on every clip that
// curator has published, the owner of their boards, and the address of
// their profile. Changing one moves all of that (see the rename_curator
// function in the database), which is why it is allowed rarely, and why
// the old name stays reserved and redirecting afterwards.

/** Matches the CHECK on profiles.name. Lowercase only — a username is an
 * address, and two names differing by case would be two addresses. */
export const USERNAME_RE = /^[a-z0-9_.-]{2,40}$/;

export const USERNAME_MAX = 40;

/** Once a fortnight. Enforced in the database too, not only here. */
export const RENAME_COOLDOWN_DAYS = 14;

export type UsernameCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Lowercases and trims, then checks the shape. Lowercasing rather than
 * rejecting is deliberate: someone typing their own name with a capital
 * has not made a mistake worth a red message.
 */
export function parseUsername(raw: unknown): UsernameCheck {
  if (typeof raw !== "string") return { ok: false, error: "Enter a username." };
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return { ok: false, error: "Enter a username." };
  if (value.length < 2) return { ok: false, error: "At least 2 characters." };
  if (value.length > USERNAME_MAX) {
    return { ok: false, error: `At most ${USERNAME_MAX} characters.` };
  }
  if (!USERNAME_RE.test(value)) {
    return {
      ok: false,
      error: "Letters, numbers, dots, dashes and underscores only.",
    };
  }
  return { ok: true, value };
}

/** When this curator may change their username again, or null if now. */
export function nextRenameAt(changedAt: string | null): Date | null {
  if (!changedAt) return null;
  const next = new Date(changedAt);
  next.setUTCDate(next.getUTCDate() + RENAME_COOLDOWN_DAYS);
  return next;
}

export function canRename(changedAt: string | null, now: Date): boolean {
  const next = nextRenameAt(changedAt);
  return next === null || next.getTime() <= now.getTime();
}
