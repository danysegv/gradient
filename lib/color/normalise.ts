import { bucketOf, type ColorBucket } from "./buckets.ts";

/** What the describer returns: a hex and roughly how much of the image it covers. */
export type RawColor = { hex: string; coverage: number };

/** What gets stored: one row per bucket, never per hex. */
export type ClipColor = { bucket: ColorBucket; coverage: number; hex: string };

/**
 * Turns the describer's list of colours into rows for clip_colors.
 *
 * Several hexes routinely land in the same bucket — a photograph has half a
 * dozen distinguishable blues — and they have to be merged, not stored
 * separately, because the primary key is (clip_id, bucket) and because a
 * clip that is 40% blue across three shades is more blue, not less. The hex
 * kept alongside is the single largest contributor, so it reads as the
 * colour a person would point at.
 *
 * Coverages are estimates from a vision model, so they don't have to sum to
 * one and sometimes exceed it. When they do, everything is scaled down
 * proportionally rather than clipped, which preserves the ordering between
 * buckets — the only thing the coverage is actually used for.
 */
export function normaliseColors(raw: readonly RawColor[]): ClipColor[] {
  const merged = new Map<ColorBucket, { coverage: number; hex: string; top: number }>();

  for (const c of raw) {
    if (typeof c?.hex !== "string") continue;
    const coverage = Number(c.coverage);
    if (!Number.isFinite(coverage) || coverage <= 0) continue;
    const bucket = bucketOf(c.hex);
    if (!bucket) continue;

    const found = merged.get(bucket);
    if (!found) {
      merged.set(bucket, { coverage, hex: c.hex, top: coverage });
    } else {
      found.coverage += coverage;
      if (coverage > found.top) {
        found.top = coverage;
        found.hex = c.hex;
      }
    }
  }

  const rows = [...merged.entries()].map(([bucket, v]) => ({
    bucket,
    coverage: v.coverage,
    hex: v.hex.startsWith("#") ? v.hex.toLowerCase() : `#${v.hex.toLowerCase()}`,
  }));

  const total = rows.reduce((sum, r) => sum + r.coverage, 0);
  if (total > 1) {
    for (const r of rows) r.coverage = r.coverage / total;
  }
  for (const r of rows) r.coverage = Math.min(1, r.coverage);

  return rows.sort((a, b) => b.coverage - a.coverage);
}
