// A curator's own words about themselves, as they arrive from a form.
// Pure, so the rules are tested rather than assumed — same shape as
// lib/boards/input.ts.
//
// One field, deliberately. The username is the name everywhere on the site
// and comes from the clip data, not from a form, so a curator can't end up
// with two names. Pictures were built and then taken back out (see
// scripts/profiles.sql) — they're a Phase-2 decision, not a launch one.

export const BIO_MAX = 280;

export type ProfileInput = {
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
  const raw = form.get("bio");
  if (typeof raw !== "string") return { bio: null };
  const value = raw
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, BIO_MAX);
  return { bio: value.length > 0 ? value : null };
}
