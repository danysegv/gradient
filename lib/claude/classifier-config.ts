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
 * Cache the taxonomy block for an hour instead of five minutes.
 *
 * This one is SAFE TO TURN ON NOW: caching changes what a call costs, not
 * what it returns. A 5-minute write bills at 1.25x input and a read at
 * 0.1x, so a cache written and never read costs 25% MORE than not caching
 * — which is precisely the shape of one person clipping something every
 * few hours. An hour's TTL writes at 2x and reads at 0.1x, and turns a
 * sporadic pattern from a penalty into a saving.
 *
 * Default true: the taxonomy block is ~3,000 tokens and identical on every
 * call, so it is the one part of the request that should never be paid for
 * twice in an afternoon.
 */
export const CLASSIFIER_CACHE_TTL: "5m" | "1h" =
  process.env.CLASSIFIER_CACHE_5M === "true" ? "5m" : "1h";

export const CACHE_CONTROL =
  CLASSIFIER_CACHE_TTL === "1h"
    ? ({ type: "ephemeral", ttl: "1h" } as const)
    : ({ type: "ephemeral" } as const);
