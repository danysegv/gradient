// Curator-aware velocity — added 2026-08-28.
//
// WHY THIS EXISTS
//
// lib/velocity.ts pools every curator's clipping into one share-shift.
// That is correct for a one-person panel and it is what shipped on
// 2026-08-24, when there was exactly one curator. With two or more
// curators of unequal volume it acquires a confound:
//
//   The trailing 30-day window can sample a DIFFERENT MIX OF PEOPLE than
//   the all-time base it is compared against. The formula reports that
//   compositional shift as a change in the culture.
//
// Measured on live data on 2026-08-28: the projected 2026-09-24 board
// correlated 0.934 (Spearman) with "how much more of Luma's clipping goes
// to this tag than Daniela's". BoldGrotesk — the library's largest tag —
// projected at -3.36 pooled while Daniela's own share-shift on it was
// +3.82. The pooled number inverted the sign on the biggest tag in the
// library. Six of nineteen tags flipped sign between the two formulas.
//
// This module does not replace lib/velocity.ts. That file stays correct
// for the single-curator case and is what the per-curator read below
// delegates to. What this adds:
//
//   1. computeVelocitiesForCurator — one person's shift against their own
//      history. Always honest, whatever the panel looks like.
//   2. computePanelComposition   — how far the window's curator mix has
//      drifted from the all-time mix. The gate metric.
//   3. computeBalancedVelocities — equal-weight mean of per-curator
//      shifts, so volume stops dominating.
//
// See claude/04am-new-chat-summary.md and
// https://claude.ai/code/artifact/0e723070-b077-4eb2-bf12-555630ff307b

import { computeTagVelocity } from "./velocity.ts";

const RECENT_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// A curator needs this many tag-applications in the trailing window before
// their own share-shift means anything, and this many all-time before
// there is a baseline to shift AGAINST. Both mirror velocity.ts's
// library-wide MIN_RECENT_WINDOW_VOLUME for the same reason: below ~30,
// a single reference moves a share by more than ~3 points on its own.
//
// Starting points, not derived from data — revisit alongside the 15/40
// count bands, the 45-day age gate, and MIN_RECENT_WINDOW_VOLUME.
export const MIN_CURATOR_RECENT_VOLUME = 30;
export const MIN_CURATOR_BASE_VOLUME = 30;

// Total-variation distance between the trailing window's curator mix and
// the all-time curator mix, above which the GLOBAL number is withheld.
//
// Read it as: "this fraction of the trailing window would have to be
// reassigned to a different curator for the window to match the library's
// all-time mix." At 0.36 (the 2026-08-28 figure) the pooled board was
// ~82% explained by the difference between two people's taste.
//
// Deliberately NOT "max single-curator share". A curator who holds 70% of
// both the window and the base is not a confound — that is simply whose
// library it is, consistently. Drift is zero in that case, and zero for a
// one-person panel, so neither needs a special case.
//
// 0.20 is a starting point, not derived from data.
export const MAX_PANEL_DRIFT = 0.2;

export type CuratorRow = {
  tagId: string;
  /** clips.clipped_by_name. Rows with a null/empty curator are ignored. */
  curator: string | null;
  createdAt: Date | string;
};

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function cutoff(now: Date): number {
  return now.getTime() - RECENT_WINDOW_DAYS * DAY_MS;
}

function named(rows: CuratorRow[]): (CuratorRow & { curator: string })[] {
  return rows.filter(
    (r): r is CuratorRow & { curator: string } =>
      typeof r.curator === "string" && r.curator.length > 0
  );
}

/**
 * One curator's velocity read, computed entirely against their own
 * history — their share of their own recent clipping, minus their share
 * of their own all-time clipping.
 *
 * This is the honest number when the panel is too small or too lopsided
 * to support a global one: it makes a claim about a person's behaviour,
 * not about the culture. Delegates to the locked formula in velocity.ts,
 * so there is exactly one definition of a share-shift in the codebase.
 *
 * Returns an empty Map if the curator has no rows.
 */
export function computeVelocitiesForCurator(
  rows: CuratorRow[],
  curator: string,
  now?: Date
): Map<string, number | null> {
  const mine = named(rows).filter((r) => r.curator === curator);
  const allReferenceDates = mine.map((r) => r.createdAt);

  const byTag = new Map<string, (Date | string)[]>();
  for (const row of mine) {
    const list = byTag.get(row.tagId) ?? [];
    list.push(row.createdAt);
    byTag.set(row.tagId, list);
  }

  const result = new Map<string, number | null>();
  for (const [tagId, tagReferenceDates] of byTag) {
    result.set(
      tagId,
      computeTagVelocity({ tagReferenceDates, allReferenceDates, now })
    );
  }
  return result;
}

export type PanelComposition = {
  /** Curators with at least one tag-application all-time. */
  curatorCount: number;
  /** Tag-applications in the trailing window, library-wide. */
  recentTotal: number;
  /** Tag-applications all-time, library-wide. */
  baseTotal: number;
  /** Each curator's share of the trailing window, 0-1. */
  recentShares: Map<string, number>;
  /** Each curator's share of all-time, 0-1. */
  baseShares: Map<string, number>;
  /**
   * Total-variation distance between the two mixes, 0-1. Zero for a
   * one-person panel and for any panel whose mix has not changed.
   */
  drift: number;
  /** Largest single-curator share of the trailing window. Diagnostic only. */
  maxRecentShare: number;
  /** Who holds maxRecentShare. Null when the window is empty. */
  dominantCurator: string | null;
  /**
   * False when drift exceeds MAX_PANEL_DRIFT — the global velocity number
   * is describing a change in who is clipping, not a change in what is
   * being clipped, and must be withheld.
   */
  safeForGlobalVelocity: boolean;
};

/**
 * The drift calculation itself, from counts alone. THE definition —
 * computePanelComposition reduces rows to counts and calls this.
 *
 * Split out 2026-08-29 so the live read can let Postgres do the counting
 * (the curator_composition RPC) instead of shipping every clip_tags row
 * with a curator name attached to the server on each request. It also
 * means the homepage never needs the names themselves: it passes counts
 * in and gets a boolean out, so no curator identity reaches the browser.
 */
export function panelCompositionFromCounts(
  counts: { curator: string; base: number; recent: number }[]
): PanelComposition {
  const baseShares = new Map<string, number>();
  const recentShares = new Map<string, number>();

  let baseTotal = 0;
  let recentTotal = 0;
  for (const c of counts) {
    baseTotal += c.base;
    recentTotal += c.recent;
  }

  for (const c of counts) {
    baseShares.set(c.curator, baseTotal === 0 ? 0 : c.base / baseTotal);
    recentShares.set(c.curator, recentTotal === 0 ? 0 : c.recent / recentTotal);
  }

  // Total-variation distance: half the sum of absolute share differences.
  let drift = 0;
  if (baseTotal > 0 && recentTotal > 0) {
    let sum = 0;
    for (const curator of baseShares.keys()) {
      sum += Math.abs(
        (recentShares.get(curator) ?? 0) - (baseShares.get(curator) ?? 0)
      );
    }
    drift = sum / 2;
  }

  let maxRecentShare = 0;
  let dominantCurator: string | null = null;
  for (const [curator, share] of recentShares) {
    if (share > maxRecentShare) {
      maxRecentShare = share;
      dominantCurator = curator;
    }
  }

  return {
    curatorCount: counts.length,
    recentTotal,
    baseTotal,
    recentShares,
    baseShares,
    drift,
    maxRecentShare,
    dominantCurator,
    safeForGlobalVelocity: drift <= MAX_PANEL_DRIFT,
  };
}

/**
 * How far the trailing window's curator mix has drifted from the all-time
 * mix. This is the panel-concentration gate's input — the fourth gate,
 * alongside the count bands, the 45-day age gate and Cooling.
 */
export function computePanelComposition(
  rows: CuratorRow[],
  now?: Date
): PanelComposition {
  const at = now ?? new Date();
  const recentCutoff = cutoff(at);
  const all = named(rows);

  const base = new Map<string, number>();
  const recent = new Map<string, number>();
  for (const row of all) {
    base.set(row.curator, (base.get(row.curator) ?? 0) + 1);
    if (toTime(row.createdAt) >= recentCutoff) {
      recent.set(row.curator, (recent.get(row.curator) ?? 0) + 1);
    }
  }

  return panelCompositionFromCounts(
    [...base.keys()].map((curator) => ({
      curator,
      base: base.get(curator) ?? 0,
      recent: recent.get(curator) ?? 0,
    }))
  );
}

/**
 * Curator-balanced velocity: each qualifying curator's own share-shift,
 * averaged with equal weight. Volume stops dragging the number — a tag
 * rises only when curators are individually moving toward it, not when
 * whoever likes it happened to clip the most this month.
 *
 * Returns null for a tag when fewer than two curators qualify. An
 * "average" over one person is that person's opinion, and this function
 * will not dress it up as a panel reading.
 *
 * NOTE this does not manufacture a panel. With N=2 it is one opinion
 * versus one other. It removes volume dominance; it does not remove the
 * fact that a two-person panel is two people.
 */
export function computeBalancedVelocities(
  rows: CuratorRow[],
  now?: Date
): Map<string, number | null> {
  const at = now ?? new Date();
  const recentCutoff = cutoff(at);
  const all = named(rows);

  const byCurator = new Map<string, (CuratorRow & { curator: string })[]>();
  for (const row of all) {
    const list = byCurator.get(row.curator) ?? [];
    list.push(row);
    byCurator.set(row.curator, list);
  }

  // Per-curator share-shift, only for curators with enough of their own
  // history on both sides of the comparison.
  const shiftsByTag = new Map<string, number[]>();
  const allTagIds = new Set(all.map((r) => r.tagId));
  let qualifying = 0;

  for (const theirRows of byCurator.values()) {
    const baseTotal = theirRows.length;
    const recentRows = theirRows.filter(
      (r) => toTime(r.createdAt) >= recentCutoff
    );
    const recentTotal = recentRows.length;

    if (
      baseTotal < MIN_CURATOR_BASE_VOLUME ||
      recentTotal < MIN_CURATOR_RECENT_VOLUME
    ) {
      continue;
    }
    qualifying++;

    const baseByTag = new Map<string, number>();
    for (const r of theirRows) {
      baseByTag.set(r.tagId, (baseByTag.get(r.tagId) ?? 0) + 1);
    }
    const recentByTag = new Map<string, number>();
    for (const r of recentRows) {
      recentByTag.set(r.tagId, (recentByTag.get(r.tagId) ?? 0) + 1);
    }

    // Every tag in the library, not just the ones this curator touched —
    // a curator dropping a tag entirely is a real negative shift, and
    // skipping it would silently bias the mean upward.
    for (const tagId of allTagIds) {
      const shift =
        (recentByTag.get(tagId) ?? 0) / recentTotal -
        (baseByTag.get(tagId) ?? 0) / baseTotal;
      const list = shiftsByTag.get(tagId) ?? [];
      list.push(shift);
      shiftsByTag.set(tagId, list);
    }
  }

  const result = new Map<string, number | null>();
  for (const tagId of allTagIds) {
    if (qualifying < 2) {
      result.set(tagId, null);
      continue;
    }
    const shifts = shiftsByTag.get(tagId) ?? [];
    const mean = shifts.reduce((a, b) => a + b, 0) / shifts.length;
    result.set(tagId, mean);
  }
  return result;
}
