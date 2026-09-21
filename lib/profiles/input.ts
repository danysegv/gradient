// A curator's own words about themselves, as they arrive from a form.
// Pure, so the rules are tested rather than assumed — same shape as
// lib/boards/input.ts.
//
// Two fields. The USERNAME is still not one of them: it comes from the clip
// data, it is what every credit and URL uses, and it can't be edited here.
// display_name (added 2026-09-20) is only what a page prints large, above
// the @username — a curator with none simply shows their username. Pictures
// were built and then taken back out (see scripts/profiles.sql) — they're a
// Phase-2 decision, not a launch one.

export const BIO_MAX = 280;
export const DISPLAY_NAME_MAX = 60;

export type ProfileInput = {
  displayName: string | null;
  bio: string | null;
};

/**
 * Trim, collapse runs of spaces, cap, and treat blank as absent.
 *
 * Null rather than "" matters: the pages omit the bio entirely when it is
 * absent, and an empty string would render as a stray empty paragraph under
 * the curator's name. Line breaks survive — a bio is two sentences, and
 * someone may want them apart — but three or more collapse to one blank line.
 */
export function parseProfileInput(form: {
  get(key: string): FormDataEntryValue | null;
}): ProfileInput {
  return {
    displayName: parseDisplayName(form.get("display_name")),
    bio: parseBio(form.get("bio")),
  };
}

/** One line: no line breaks survive, since it is set as a heading. */
function parseDisplayName(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const value = raw
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DISPLAY_NAME_MAX);
  return value.length > 0 ? value : null;
}

function parseBio(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const value = raw
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, BIO_MAX);
  return value.length > 0 ? value : null;
}
