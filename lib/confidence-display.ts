import type { ConfidenceState } from "./confidence.ts";

/**
 * The one-line confidence note rendered under a tag's count, on the
 * Signals Feed and on curator pages alike.
 *
 * Extracted from app/page.tsx on 2026-08-28 when /curator/[name] needed
 * the identical rule. There must be exactly one place that decides how a
 * velocity figure is worded — two copies drift, and the wording is the
 * product's whole claim to rigor.
 */
export function confidenceNoteText(state: ConfidenceState): string {
  if (state.label) return state.label;
  if (state.velocity !== null) {
    // Velocity is a share-shift (this tag's share of the trailing 30-day
    // window vs its share of all-time) — see lib/velocity.ts. Labeled
    // "30d" because that's the window the number is actually keyed to,
    // even though the 45-day age gate above it still spans 90.
    return `${formatVelocity(state.velocity)} · 30d`;
  }
  // Age- and count-eligible, but the recent-window volume was too thin to
  // trust a share figure yet (see MIN_RECENT_WINDOW_VOLUME) — show
  // something true rather than nothing.
  return `${state.referenceCount} references`;
}

/**
 * A velocity figure as words: "+1%", "-2%", "0%". Whole points, the same
 * everywhere a velocity is printed — the feed, curator pages, the radar.
 * Split out of confidenceNoteText on 2026-09-25 so the radar could print
 * a figure without re-deciding its rounding.
 */
export function formatVelocity(velocity: number): string {
  const pct = Math.round(velocity * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
