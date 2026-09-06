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


/**
 * Which axes currently carry frozen tags.
 *
 * Every published RPC now hides frozen tags, so no surface can otherwise
 * tell that an axis is mid-expansion. Step 1.7 needs to know: once the
 * classifier can reach TechMono or StretchType, a thin incumbent like
 * HandType (2 references in 14 days) can go 30 days untouched and trip
 * Cooling — the product announcing that a look is dying when the
 * vocabulary merely got more precise.
 *
 * Returns an empty set on error, i.e. exactly today's Cooling behaviour.
 * A transient RPC failure should not silently withhold a real Cooling
 * signal library-wide; it should change nothing.
 */
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function fetchFrozenAxes(
  client: RpcClient
): Promise<ReadonlySet<string>> {
  const { data, error } = await client.rpc("frozen_axes");
  if (error || !Array.isArray(data)) return new Set<string>();
  return new Set(
    (data as { group?: unknown }[])
      .map((r) => r.group)
      .filter((g): g is string => typeof g === "string")
  );
}


/**
 * The only axes the widened-taxonomy reclassify path may ever be pointed
 * at.
 *
 * `medium` and `subject` are NEW axes: adding one to an existing clip
 * removes nothing, so no published share is rewritten. The five original
 * axes are single-select and already populated — re-running against a
 * widened `layout` leaves the clip holding two layout tags, which breaks
 * the invariant every co-occurrence and share figure is computed against
 * and silently restates published numbers.
 *
 * A hard allowlist, not a convention. Widening it is a decision about
 * published numbers, not a refactor. Lives here rather than next to the
 * query so it is pure and can be tested without standing up Supabase.
 */
export const ADDITIVE_AXES = ["medium", "subject"] as const;
export type AdditiveAxis = (typeof ADDITIVE_AXES)[number];

/** Throws on any axis that is not additive. Returns nothing on success. */
export function assertAdditiveAxes(axes: readonly string[]): void {
  const illegal = axes.filter(
    (a) => !(ADDITIVE_AXES as readonly string[]).includes(a)
  );
  if (illegal.length > 0) {
    throw new Error(
      `Refusing to reclassify against non-additive axes: ${illegal.join(", ")}. ` +
        `Only ${ADDITIVE_AXES.join(", ")} may be backfilled — the others are ` +
        `single-select, so backfilling them replaces the tag already there ` +
        `and restates published numbers.`
    );
  }
}
