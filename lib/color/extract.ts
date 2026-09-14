import { bucketOf, type ColorBucket } from "./buckets.ts";
import type { ClipColor } from "./normalise.ts";

/** Buckets below this share of the frame are detail, not what a clip reads as. */
export const MIN_PIXEL_SHARE = 0.01;

/** At most this many buckets per clip, most-present first. */
export const MAX_BUCKETS = 6;

const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/**
 * Dominant colours straight from the pixels, with no model involved.
 *
 * There is no clustering step and there does not need to be one: the app
 * only ever asks "how much of this image is yellow", and bucketOf already
 * answers that for a single colour. So every pixel is bucketed with the
 * SAME function the search uses, and coverage is just a pixel count. That
 * makes extraction and search agree by construction rather than by
 * coincidence — a k-means centroid could sit right on a bucket boundary and
 * land on the other side of it from the pixels it represents.
 *
 * The hex kept per bucket is the mean of the pixels in it, so it reads as
 * the colour a person would point at rather than one arbitrary sample.
 *
 * `pixels` is raw interleaved RGB or RGBA, as sharp's `.raw()` returns it.
 * Fully transparent pixels are skipped — a logo on transparency is not a
 * black image.
 */
export function colorsFromPixels(
  pixels: ArrayLike<number>,
  channels: 3 | 4 = 3
): ClipColor[] {
  const acc = new Map<
    ColorBucket,
    { count: number; r: number; g: number; b: number }
  >();
  let counted = 0;

  for (let i = 0; i + channels - 1 < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (channels === 4 && pixels[i + 3] < 8) continue;

    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    const bucket = bucketOf(hex);
    if (!bucket) continue;

    counted += 1;
    const found = acc.get(bucket);
    if (found) {
      found.count += 1;
      found.r += r;
      found.g += g;
      found.b += b;
    } else {
      acc.set(bucket, { count: 1, r, g, b });
    }
  }

  if (counted === 0) return [];

  return [...acc.entries()]
    .map(([bucket, v]) => ({
      bucket,
      coverage: v.count / counted,
      hex: `#${toHex(v.r / v.count)}${toHex(v.g / v.count)}${toHex(v.b / v.count)}`,
    }))
    .filter((c) => c.coverage >= MIN_PIXEL_SHARE)
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, MAX_BUCKETS);
}
