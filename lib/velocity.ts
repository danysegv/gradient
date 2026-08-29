// Trailing velocity formula — see CLAUDE.md "Confidence display (locked)"
// and the 2026-08-24 decisions-log entry for how this definition was
// chosen over the alternatives (growth rate, share-vs-90-days-ago).
//
// Both alternatives compare a "recent" period against a "prior" period of
// equal length elsewhere in the library's history. That's structurally
// unanswerable until the library itself is old enough to contain a full
// prior period — 180 days for growth rate, 90 for a 90-days-ago snapshot.
// The library's first reference is 2026-08-10, so both would still return
// null on 2026-11-08 at the earliest, more than a month after the 45-day
// age gate opens. Neither could ever produce the number this system was
// built to show.
//
// This definition instead compares a tag's share of *recent* tagging
// activity against its share of *all-time* tagging activity — no
// symmetric "before" period required, so it's answerable as soon as the
// library has any meaningful recent activity at all:
//
//   recentShare = this tag's references in the trailing 30 days
//                 / all references (every tag) in the trailing 30 days
//   baseShare   = this tag's references all-time
//                 / all references (every tag) all-time
//   velocity    = recentShare - baseShare   (a fraction; display multiplies
//                 by 100 for percentage points, same as before)
//
// Numerator and denominator of each share come from the same window, so a
// heavy clipping day inflates both proportionally and cancels out of the
// share — it only moves a tag's velocity if that day was disproportionately
// about that tag, which is real signal, not calendar noise. That property
// is why this definition survives an uneven, bursty clipping cadence where
// a plain "references per week" rate would not: a rate spikes every time
// there's a free afternoon, because it never divides by anything that
// scales with the burst.

// Exported so callers that push the counting into Postgres pass the SAME
// window to the tag_velocity_counts / curator_composition RPCs. 30 is
// written down exactly once, here — the SQL takes it as a parameter
// rather than hardcoding an interval, so the two cannot drift apart.
export const RECENT_WINDOW_DAYS = 30;

// Below this many total tag-applications (library-wide) in the trailing
// window, a single reference moves any given tag's recentShare by more
// than ~3 percentage points on its own — the number would be describing
// one clipping session, not a trend. 30 is a starting point (roughly one
// tag-application a day across the whole library), not derived from data
// — revisit alongside the 15/40 count bands and the 45-day age gate.
const MIN_RECENT_WINDOW_VOLUME = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function countSince(dates: (Date | string)[], cutoffMs: number): number {
  let count = 0;
  for (const d of dates) {
    if (toTime(d) >= cutoffMs) count++;
  }
  return count;
}

/**
 * The share-shift itself, from counts alone. This is THE definition —
 * everything else in this file and in curator-velocity.ts reduces to it.
 *
 * Split out 2026-08-28 so the live read can let Postgres do the counting
 * (see the tag_velocity_counts RPC) instead of shipping every clip_tags
 * row to the server on each request. The counts arrive pre-aggregated;
 * the arithmetic still happens in exactly one place.
 *
 * Returns null rather than a fabricated figure when the trailing window is
 * too thin to trust, or when the all-time set is empty.
 */
export function velocityFromCounts(input: {
  /** This tag's references, all-time, active clips only. */
  baseRefs: number;
  /** This tag's references inside the trailing window. */
  recentRefs: number;
  /** EVERY tag's references all-time — the library-wide denominator. */
  baseTotalRefs: number;
  /** Every tag's references inside the trailing window. */
  recentTotalRefs: number;
}): number | null {
  const { baseRefs, recentRefs, baseTotalRefs, recentTotalRefs } = input;
  if (baseTotalRefs === 0) return null;
  if (recentTotalRefs < MIN_RECENT_WINDOW_VOLUME) return null;
  return recentRefs / recentTotalRefs - baseRefs / baseTotalRefs;
}

/**
 * Pure share-shift velocity for a single tag. No I/O — callers supply the
 * raw reference timestamps (already filtered to active/non-archived
 * clips, matching the tag_clip_counts view). `now` is injectable for
 * tests; defaults to the real current time.
 *
 * Returns null — never a fabricated or extrapolated figure — when there
 * isn't enough recent-window volume (library-wide) to trust the number,
 * or in the degenerate all-time-empty case.
 */
export function computeTagVelocity(input: {
  /** This tag's clip_tags.created_at, all-time, active clips only. */
  tagReferenceDates: (Date | string)[];
  /** Every tag's clip_tags.created_at, all-time, active clips only —
   * i.e. the library-wide denominator, not just this tag's. */
  allReferenceDates: (Date | string)[];
  now?: Date;
}): number | null {
  const now = input.now ?? new Date();
  const recentCutoff = now.getTime() - RECENT_WINDOW_DAYS * DAY_MS;

  // Reduce the dates to counts, then defer to the one definition above.
  return velocityFromCounts({
    baseRefs: input.tagReferenceDates.length,
    recentRefs: countSince(input.tagReferenceDates, recentCutoff),
    baseTotalRefs: input.allReferenceDates.length,
    recentTotalRefs: countSince(input.allReferenceDates, recentCutoff),
  });
}

/**
 * Convenience batch form: computes every tag's velocity from one flat
 * list of {tagId, createdAt} rows (e.g. every active clip_tags row across
 * the whole library, fetched once), instead of re-fetching the library-
 * wide denominator per tag. Pure — same `now` seam as computeTagVelocity.
 */
export function computeVelocitiesForTags(
  rows: { tagId: string; createdAt: Date | string }[],
  now?: Date
): Map<string, number | null> {
  const allReferenceDates = rows.map((r) => r.createdAt);

  const byTag = new Map<string, (Date | string)[]>();
  for (const row of rows) {
    const list = byTag.get(row.tagId) ?? [];
    list.push(row.createdAt);
    byTag.set(row.tagId, list);
  }

  const result = new Map<string, number | null>();
  for (const [tagId, tagReferenceDates] of byTag) {
    result.set(
      tagId,
      computeTagVelocity({ tagReferenceDates, allReferenceDates, now })
    );
  }
  return result;
}
