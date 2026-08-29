// Confidence display logic — see CLAUDE.md "Confidence display (locked)".
// The 15/40 count cutoffs and 30-day cooling window are the locked spec.
// The 45-day age gate below is an addition on top of it (2026-08-21): a
// tag can only show a velocity number once its earliest reference is at
// least half the 90-day trailing window old — otherwise a "velocity" is
// just noise computed from too few days of data, even if reference count
// alone would clear the 15/40 bands. This is a starting point like the
// count cutoffs, not derived from data — revisit alongside them.

export const EARLY_SIGNAL_MAX = 14; // under 15 references
export const FULL_STAT_MIN = 41; // over 40 references
const VELOCITY_WINDOW_DAYS = 90;
export const AGE_GATE_DAYS = VELOCITY_WINDOW_DAYS / 2; // ~45 days
export const COOLING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ConfidenceBand = "early-signal" | "velocity" | "full-stat";

export type ConfidenceState = {
  /** Count-and-age-gated band. Always "early-signal" until both the
   * reference-count and calendar-age gates clear. */
  band: ConfidenceBand;
  referenceCount: number;
  /** True when there's been no new reference in the last 30 days —
   * independent of `band`, and takes visual precedence over it. */
  cooling: boolean;
  /** The velocity figure to display, or null. Null whenever `band` is
   * "early-signal", whenever `cooling` is true (a stale number would
   * contradict what Cooling is for — see CLAUDE.md: "stops a large
   * historical pile from reading as a live signal"), or whenever no
   * precomputed velocity was supplied. This function never invents one —
   * the trailing-90-day velocity formula itself isn't built yet, so
   * callers pass a precomputed number (from wherever that eventually
   * lives) via `velocity`, and get it back only when it's actually safe
   * to show. */
  velocity: number | null;
  /** True when the count and age gates both cleared but the panel's
   * curator mix has drifted too far for a GLOBAL number to mean anything
   * — see lib/curator-velocity.ts. The tag is not early and not cooling;
   * the library just cannot say what the culture did, only what its
   * curators did. Per-curator reads are unaffected. */
  panelSkew: boolean;
  /** What to render as the confidence note: "Cooling", "Early Signal",
   * "Panel Skew", or null (velocity/full-stat bands with a real number
   * don't need a special word — the number and reference count speak for
   * themselves).
   *
   * NOTE the "Panel Skew" wording is a placeholder pending Daniela's
   * call; the mechanism is settled, the word is not. Per the identity
   * system it renders in Bone like every other small label — "Cooling" in
   * Slate is the one documented exception and this is not it. */
  label: "Cooling" | "Early Signal" | "Panel Skew" | null;
};

export function getConfidence(input: {
  referenceCount: number;
  earliestReferenceAt: Date | string | null;
  latestReferenceAt: Date | string | null;
  /** A precomputed velocity figure, if one exists. Never fabricated here. */
  velocity?: number | null;
  /**
   * Whether the panel's curator composition can currently support a
   * GLOBAL velocity number — pass
   * computePanelComposition(...).safeForGlobalVelocity from
   * lib/curator-velocity.ts.
   *
   * Defaults to true, so existing callers keep their exact behaviour and
   * a single-curator library is never gated (its drift is structurally
   * zero). When false, the velocity figure is withheld the same way
   * Cooling withholds it: showing a number that is really a portrait of
   * whoever clipped most this month is worse than showing none.
   *
   * Deliberately a boolean and not the raw rows: the caller aggregates
   * server-side, so no curator name needs to reach the browser.
   */
  panelSafeForGlobalVelocity?: boolean;
  /** Injectable for tests; defaults to the real current time. */
  now?: Date;
}): ConfidenceState {
  const now = input.now ?? new Date();
  const earliest = toDate(input.earliestReferenceAt);
  const latest = toDate(input.latestReferenceAt);

  const countBand: ConfidenceBand =
    input.referenceCount >= FULL_STAT_MIN
      ? "full-stat"
      : input.referenceCount > EARLY_SIGNAL_MAX
        ? "velocity"
        : "early-signal";

  const ageEligible =
    earliest !== null && daysBetween(earliest, now) >= AGE_GATE_DAYS;

  const band: ConfidenceBand =
    countBand === "early-signal" ? "early-signal" : ageEligible ? countBand : "early-signal";

  const cooling = latest !== null && daysBetween(latest, now) >= COOLING_DAYS;

  const panelSafe = input.panelSafeForGlobalVelocity ?? true;
  // Only meaningful once the other gates have cleared — a tag already
  // reading Early Signal or Cooling isn't showing a number to withhold.
  const panelSkew = !panelSafe && !cooling && band !== "early-signal";

  const velocity =
    !cooling && !panelSkew && band !== "early-signal"
      ? (input.velocity ?? null)
      : null;

  // Cooling takes precedence: a tag nobody has referenced in 30 days is
  // stale regardless of who was clipping in that window.
  const label: ConfidenceState["label"] = cooling
    ? "Cooling"
    : band === "early-signal"
      ? "Early Signal"
      : panelSkew
        ? "Panel Skew"
        : null;

  return {
    band,
    referenceCount: input.referenceCount,
    cooling,
    panelSkew,
    velocity,
    label,
  };
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}
