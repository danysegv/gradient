import type { ColorBucket } from "./buckets.ts";
import type { ClipColor } from "./normalise.ts";

/** Buckets that describe lightness rather than hue. */
export const NEUTRALS: readonly ColorBucket[] = ["black", "grey", "white"];

/**
 * How much of the frame a hue must hold to be what the image IS.
 *
 * This is the whole decision. Design references overwhelmingly sit on
 * white, grey or black — a packshot, a poster, a spread — so the largest
 * bucket by raw pixel count is usually the background, not the colour
 * anyone would name. Take the literal maximum and White swallows the
 * library while Red stays empty, which is the failure that makes a colour
 * picker useless.
 *
 * A sixth of the frame is the line: enough that a person would call the
 * image red, not so much that a red poster on a white wall files under
 * White. Tunable here, and because clip_colors keeps the full breakdown,
 * changing it is one UPDATE — no image is ever read twice.
 */
export const CHROMATIC_FLOOR = 0.15;

const isNeutral = (b: ColorBucket) => NEUTRALS.includes(b);

/**
 * The one colour a clip is filed under.
 *
 * The strongest hue that clears CHROMATIC_FLOOR, or — when the image really
 * is just black, white and grey — its largest neutral. Null only for a clip
 * with no readable colour at all.
 */
export function primaryBucket(colors: readonly ClipColor[]): ColorBucket | null {
  if (colors.length === 0) return null;

  let bestChromatic: ClipColor | null = null;
  let bestOverall: ClipColor | null = null;

  for (const c of colors) {
    if (!bestOverall || c.coverage > bestOverall.coverage) bestOverall = c;
    if (isNeutral(c.bucket)) continue;
    if (c.coverage < CHROMATIC_FLOOR) continue;
    if (!bestChromatic || c.coverage > bestChromatic.coverage) bestChromatic = c;
  }

  return (bestChromatic ?? bestOverall)?.bucket ?? null;
}

/** The same list, with exactly one row flagged as the clip's colour. */
export function withPrimary(
  colors: readonly ClipColor[]
): (ClipColor & { is_primary: boolean })[] {
  const primary = primaryBucket(colors);
  let claimed = false;
  return colors.map((c) => {
    const is_primary = !claimed && c.bucket === primary;
    if (is_primary) claimed = true;
    return { ...c, is_primary };
  });
}
