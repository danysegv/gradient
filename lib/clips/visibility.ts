import { PUBLIC_TAG_CONFIDENCE } from "../tag-confidence.ts";

/**
 * Whether a clip is classified enough to show in public.
 *
 * A clip earns its place in the library once the classifier has read it
 * and at least one reading clears the public line (lib/tag-confidence.ts
 * — the same line the trait chips use). Below that, or with no readings
 * at all, the tile carries no claim about the work: it is an image with
 * nothing said about it, which is the one thing 04AM is not.
 *
 * This is display only. Nothing here touches a count, a share, a
 * velocity or panel drift — those are computed in Postgres from every
 * active clip, classified or not, and a clip hidden by this rule still
 * counts in all of them, still has its own page, and still appears in
 * the clipper where it can be fixed.
 */
type Reading = { confidence: number | null };

export function isClassified(readings: Reading[] | null | undefined): boolean {
  return (readings ?? []).some(
    (r) => (r.confidence ?? 0) >= PUBLIC_TAG_CONFIDENCE
  );
}

/** The classified ones, in the order given. */
export function onlyClassified<T>(
  clips: T[],
  readingsOf: (clip: T) => Reading[] | null | undefined
): T[] {
  return clips.filter((c) => isClassified(readingsOf(c)));
}
