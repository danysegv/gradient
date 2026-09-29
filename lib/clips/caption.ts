// Editing a clip's caption (Daniela, 2026-09-28). Pure rules, tested.
//
// Who: the curator who clipped it, or an admin. The caption is the
// clipper's own words about the reference, so nobody else rewrites it.
// What: plain text, trimmed, at most the same 4,000 characters the clip
// form allows; an empty caption removes it rather than saving blank space.

export const MAX_CAPTION = 4000;

export type CaptionCheck = { ok: true; value: string | null } | { ok: false; error: string };

export function parseCaption(raw: unknown): CaptionCheck {
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    return { ok: false, error: "That isn't text." };
  }
  const value = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (value.length > MAX_CAPTION) {
    return { ok: false, error: `At most ${MAX_CAPTION.toLocaleString("en-US")} characters.` };
  }
  return { ok: true, value: value === "" ? null : value };
}

export function canEditCaption(
  session: { name: string; isAdmin: boolean } | null,
  clippedBy: string | null
): boolean {
  if (!session) return false;
  return session.isAdmin || (clippedBy !== null && clippedBy === session.name);
}
