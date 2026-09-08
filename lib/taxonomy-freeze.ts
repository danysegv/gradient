// Deliberately NOT `import "server-only"`. This module holds no secrets
// and does no I/O beyond one RPC, and server-only makes it unimportable
// from `node --test`, which is where the freeze is verified.

/**
 * The incubation freeze. `tags.published_at` is the whole mechanism:
 * null = incubating, non-null = published.
 *
 * ⚠ IT IS A FREEZE ON FIGURES, NOT ON THE TAXONOMY.
 *
 * Revised 2026-09-08. The original design hid incubating tags from every
 * RPC, which also hid them from navigation, filters, tag rails and the
 * clipper — far more than incubation needs, and not what it was for. An
 * incubating tag is a normal tag: the classifier applies it, it appears
 * on clips, it is filterable, and it shows its reference count.
 *
 * What it never gets is a NUMBER OF THE RADAR KIND — velocity, share,
 * panel drift, co-occurrence. Those are all shares of a library-wide
 * denominator, and an incubating tag is excluded from that denominator
 * on both sides. Quoting one would be dividing by a total the tag was
 * never part of.
 *
 * Where that split is enforced:
 *   * tag_velocity_counts / curator_tag_counts return EVERY tag with an
 *     `is_published` flag. The caller sums denominators over published
 *     rows only, and getConfidence withholds velocity when
 *     `isPublished` is false, labelling the tag "Incubating".
 *   * curator_composition, tag_cooccurrence, tag_curator_breakdown,
 *     library_clip_stats and curator_clip_stats stay published-only.
 *     They produce figures and nothing else.
 *   * The backfill writes ONLY incubating tags and never deletes, so no
 *     published clip_tags row is created, changed or removed.
 *
 * Graduation sets `published_at` and the tag simply starts counting.
 */

/**
 * The date the incubating vocabulary was opened for classification.
 * Documentation only — nothing enforces it in code any more.
 */
export const NEW_VOCABULARY_OPENED = "2026-09-08";

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
