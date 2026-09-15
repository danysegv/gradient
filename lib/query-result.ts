// The difference between "nothing" and "broken".
//
// Every page in this app read its queries as `(res.data ?? []) as Row[]`,
// which collapses those two states into one. On 2026-09-12 the database
// returned 502s for three minutes and the homepage rendered "No clips yet."
// — a confident, calm claim that 04AM had no library. A reader cannot tell
// that apart from the truth, and neither can a screenshot.
//
// Worse than the copy: a failed query that reads as an empty result also
// feeds zeros into anything computed downstream. `panel_composition`
// failing yields an empty count list, which yields a drift of 0, which
// passes the 20% gate — the concentration gate FAILS OPEN under exactly
// the conditions where nobody is watching. That is why this returns a flag
// instead of throwing: the page must keep rendering, and the figures that
// depend on a query must know the query didn't answer.

export type Loaded<T> = {
  readonly rows: T[];
  /**
   * True when the query FAILED. `rows` is empty either way — the point of
   * this flag is that the emptiness means nothing, so no copy may describe
   * it and no gate may read it as a safe zero.
   */
  readonly failed: boolean;
};

/** Read a PostgREST result without losing the failure. `label` names it in the log. */
export function loaded<T>(
  label: string,
  res: { data: unknown; error: { message: string } | null }
): Loaded<T> {
  if (res.error) {
    // Server-side only; this runs in a React Server Component. The reader
    // gets the copy below, the operator gets the reason.
    console.error(`[04am] query "${label}" failed: ${res.error.message}`);
    return { rows: [], failed: true };
  }
  return { rows: (res.data ?? []) as T[], failed: false };
}

/**
 * What an empty grid should say. Null query state → the honest sentence;
 * a real empty library → the ordinary one.
 *
 * Deliberately not "Something went wrong": it says which thing, and that
 * the right response is to wait rather than to conclude anything about the
 * library.
 */
export const LIBRARY_UNAVAILABLE =
  "The library didn't load just now — this is a connection problem, not an empty shelf. Try again in a moment.";
