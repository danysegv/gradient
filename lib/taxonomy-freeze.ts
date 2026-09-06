// Deliberately NOT `import "server-only"`. This module holds no secrets
// and does no I/O — one constant and one env read — and server-only makes
// it unimportable from `node --test`, which is where the freeze is
// verified. Its only consumer, lib/claude/classify-clip.ts, is
// server-only itself.

/**
 * The incubation freeze. `tags.published_at` is the whole mechanism:
 * null = frozen, non-null = published.
 *
 * A frozen tag is invisible in two different places, with two different
 * lifetimes, and conflating them is the mistake this module exists to
 * prevent:
 *
 *   WRITE PATH — the classifier's taxonomy (`lib/claude/classify-clip.ts`).
 *     Frozen tags are hidden from the model so it cannot apply them.
 *     Lifts 2026-09-27, when the new vocabulary opens for clipping.
 *
 *   READ PATH — every published metric (the eight RPCs).
 *     Frozen tags are excluded from the numerator AND the denominator, so
 *     a clip going to HardCrop instead of RawAsymmetry leaves both sides
 *     of the fraction and no incumbent is diluted.
 *     Lifts at graduation, ~2026-11-11 — seven weeks later.
 *
 * Lifting the write-path guard must not lift the read-path filter. That
 * is why this is a flag about the classifier and not a general
 * `isPublished()` helper shared by both.
 */

/** Documentation only. The date is deliberately not enforced in code. */
export const NEW_VOCABULARY_OPENS = "2026-09-27";

/**
 * Whether the classifier may see frozen tags.
 *
 * An env flag rather than a date comparison, on purpose. A date opens the
 * vocabulary by itself even if the 09-26 launch slips — a silent failure
 * in the expensive direction, since fourteen days of diverted
 * applications inside the launch window drop RawAsymmetry toward −16
 * points. This requires a person to set CLASSIFIER_INCLUDE_FROZEN_TAGS
 * in Vercel on 09-27; an absent, empty or misspelled value keeps the
 * freeze, which is the safe direction to fail in.
 *
 * Read at call time, not module load: `lib/clip-auth.ts` caches its env
 * at module level and that has already cost one debugging session.
 */
export function classifierSeesFrozenTags(): boolean {
  return process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS === "true";
}
