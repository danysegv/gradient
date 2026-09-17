// The knobs that decide what a classification costs, in one place, all
// defaulting to EXACTLY what shipped before this file existed.
//
// Reading this file changes nothing. Setting an environment variable
// changes it, and lib/claude/classifier-config.test.ts fails if any
// default drifts from what the launch board was measured with.
//
// WHY IT'S BUILT NOW AND SWITCHED LATER. The cheap path is worth roughly
// 20x, and 04AM is running on a $6 balance. But the classifier prompt and
// the image it receives ARE the measuring instrument for the 09-26 board:
// change either, and figures before and after the change aren't
// comparable, which is the one thing a trend product cannot afford. So the
// work lands now, dark, and flips on the 27th with an env var instead of a
// deploy written under time pressure.
//
// THE ORDER TO TURN THEM ON, AFTER 09-26:
//   1. CLASSIFIER_IMAGE_EDGE=768  — biggest single win, smallest risk. The
//      image is most of the bill; 768px is ample for "is this bold
//      grotesk". Re-tag ~30 clips and compare before keeping it.
//   2. CLASSIFIER_MODEL=claude-haiku-4-5 — ~5x more, and the real risk.
//      Run scripts/classifier-eval.ts first: per-axis agreement is the
//      decision, and `movement` is where it will hurt.
//   3. Merge classify + describe into one call. Not a flag — a rewrite —
//      but it removes a whole second upload of the same image.
// One at a time, each measured. Together they are unattributable.

/** The model that read the launch library. Overridden by CLASSIFIER_MODEL. */
export const DEFAULT_CLASSIFIER_MODEL = "claude-opus-5";

export const CLASSIFIER_MODEL =
  process.env.CLASSIFIER_MODEL?.trim() || DEFAULT_CLASSIFIER_MODEL;

/**
 * Longest edge, in pixels, to downscale to before sending. Null sends the
 * source URL untouched, which is what the launch library was read at.
 *
 * Anthropic bills vision in 28x28 patches and caps a high-resolution image
 * at 4,784 tokens. A 768px square is ~784. That is the whole trick: the
 * picture is most of the bill, and most of the picture is detail no
 * classifier decision depends on.
 *
 * Unparseable or absurd values fall back to null rather than to some
 * guessed number — an image size nobody chose is worse than the original.
 */
function parseEdge(raw: string | undefined): number | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 224 || n > 2576) return null;
  return Math.round(n);
}

export const CLASSIFIER_IMAGE_EDGE = parseEdge(process.env.CLASSIFIER_IMAGE_EDGE);

/**
 * How long the taxonomy block stays cached.
 *
 * Safe to change at any time: caching alters what a call costs, never what
 * it returns. It is the only lever here with that property.
 *
 * FIVE MINUTES, revised 2026-09-17 after the first real ledger rows
 * contradicted the reasoning that set it to an hour. Measured, on the same
 * 5,288-token taxonomy block:
 *
 *   cache miss, 5-minute write   $0.045   (1.25x input)
 *   cache miss, 1-hour write     $0.079   (2x input)
 *   cache hit                    $0.015-0.021
 *   no cache at all              ~$0.039
 *
 * Two things follow, and the second is the one that was got wrong.
 *
 * A hit is worth roughly two-thirds off, so caching is clearly right
 * inside a batch — the Process button runs twenty clips back to back in
 * about two minutes, one write and nineteen reads.
 *
 * But a batch finishes well inside five minutes, so the hour buys nothing
 * and costs 60% more to write. And for the path that matters more — one
 * person saving one clip, hours from the last — an hour's TTL makes a
 * solitary call cost DOUBLE what not caching would. The argument for the
 * hour was that sporadic clipping would get hits it otherwise missed; the
 * ledger says those hits do not happen, and the premium does.
 *
 * Set CLASSIFIER_CACHE_1H=true to go back, if the clipping pattern ever
 * changes enough to earn it. The honest fix for the solitary path is to
 * skip the cache entirely there, which needs the classifier to know
 * whether it is in a batch — a post-09-26 change, noted in the docs.
 */
export const CLASSIFIER_CACHE_TTL: "5m" | "1h" =
  process.env.CLASSIFIER_CACHE_1H === "true" ? "1h" : "5m";

export const CACHE_CONTROL =
  CLASSIFIER_CACHE_TTL === "1h"
    ? ({ type: "ephemeral", ttl: "1h" } as const)
    : ({ type: "ephemeral" } as const);
