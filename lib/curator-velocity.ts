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
// count bands, the 30-day age gate, and MIN_RECENT_WINDOW_VOLUME.
export const MIN_CURATOR_RECENT_VOLUME = 30;
export const MIN_CURATOR_BASE_VOLUME = 30;

// ...and this many applications from BEFORE the window. Added 2026-10-12.
//
// The base includes the window, so a curator's shift is damped by exactly
// the fraction of their history that predates it:
//
//   recentShare − baseShare = (prior / base) · (recentShare − priorShare)
//
// A curator whose whole history sits inside the window (prior = 0) shifts
// by exactly zero on every tag. They carry no information, but in an
// equal-weight mean they still cast a vote — for "nothing moved". On
// 2026-10-12 one such curator (37 of 37 applications in the window) was
// pulling every balanced figure a third of the way to zero. A newcomer
// joins the average once they have a past to move against.
//
// 15, not 30: the regression shape below (a second curator with 20 prior
// applications) is a real panel and must stay one. A starting point.
export const MIN_CURATOR_PRIOR_VOLUME = 15;

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
 * Maps a clipping identity to the human behind it — `curator_identities`
 * in the database, keyed by clips.clipped_by_name.
 *
 * One person can hold more than one identity (a pen name, a second
 * editorial voice). The public surfaces keep showing the NAME; that is the
 * editorial identity and it is the point. Everything that reasons about
 * PANEL PLURALITY has to see the person, or one curator with two logins
 * reads as two curators — which is precisely the confound the panel gate
 * was built to catch.
 */
export type CuratorIdentities = ReadonlyMap<string, string>;

/**
 * An unmapped name is its own person. Never drop the row: leaving an
 * unmapped curator out would shrink the panel silently and flatter every
 * number computed from it — the same failure mode as letting an incubating
 * tag into a published denominator.
 */
export function personOf(
  curator: string,
  identities: CuratorIdentities
): string {
  return identities.get(curator) ?? curator;
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
  /** People with at least one tag-application all-time. */
  personCount: number;
  /** Tag-applications in the trailing window, library-wide. */
  recentTotal: number;
  /** Tag-applications all-time, library-wide. */
  baseTotal: number;
  /** Each person's share of the trailing window, 0-1. */
  recentShares: Map<string, number>;
  /** Each person's share of all-time, 0-1. */
  baseShares: Map<string, number>;
  /**
   * Total-variation distance between the two mixes, 0-1. Zero for a
   * one-person panel and for any panel whose mix has not changed.
   */
  drift: number;
  /** Largest single-person share of the trailing window. Diagnostic only. */
  maxRecentShare: number;
  /** Who holds maxRecentShare. Null when the window is empty. */
  dominantPerson: string | null;
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
  counts: { person: string; base: number; recent: number }[]
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
    baseShares.set(c.person, baseTotal === 0 ? 0 : c.base / baseTotal);
    recentShares.set(c.person, recentTotal === 0 ? 0 : c.recent / recentTotal);
  }

  // Total-variation distance: half the sum of absolute share differences.
  let drift = 0;
  if (baseTotal > 0 && recentTotal > 0) {
    let sum = 0;
    for (const person of baseShares.keys()) {
      sum += Math.abs(
        (recentShares.get(person) ?? 0) - (baseShares.get(person) ?? 0)
      );
    }
    drift = sum / 2;
  }

  let maxRecentShare = 0;
  let dominantPerson: string | null = null;
  for (const [person, share] of recentShares) {
    if (share > maxRecentShare) {
      maxRecentShare = share;
      dominantPerson = person;
    }
  }

  return {
    personCount: counts.length,
    recentTotal,
    baseTotal,
    recentShares,
    baseShares,
    drift,
    maxRecentShare,
    dominantPerson,
    safeForGlobalVelocity: drift <= MAX_PANEL_DRIFT,
  };
}

/**
 * How far the trailing window's curator mix has drifted from the all-time
 * mix. This is the panel-concentration gate's input — the fourth gate,
 * alongside the count bands, the 30-day age gate and Cooling.
 */
export function computePanelComposition(
  rows: CuratorRow[],
  identities: CuratorIdentities,
  now?: Date
): PanelComposition {
  const at = now ?? new Date();
  const recentCutoff = cutoff(at);
  const all = named(rows);

  const base = new Map<string, number>();
  const recent = new Map<string, number>();
  for (const row of all) {
    const person = personOf(row.curator, identities);
    base.set(person, (base.get(person) ?? 0) + 1);
    if (toTime(row.createdAt) >= recentCutoff) {
      recent.set(person, (recent.get(person) ?? 0) + 1);
    }
  }

  return panelCompositionFromCounts(
    [...base.keys()].map((person) => ({
      person,
      base: base.get(person) ?? 0,
      recent: recent.get(person) ?? 0,
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
 *
 * Grouped by PERSON, not by name, for the same reason — and here the stakes
 * are higher than in the drift gate. This is an equal-weight mean over
 * curators: one human holding two identities would get two votes in an
 * average built specifically to give each person one. Splitting their
 * clipping would also halve each identity's volume, and either half falling
 * under MIN_CURATOR_BASE_VOLUME disqualifies it entirely — a person can be
 * silently voted twice or not at all depending on how they log in.
 */
export function computeBalancedVelocities(
  rows: CuratorRow[],
  identities: CuratorIdentities,
  now?: Date
): Map<string, number | null> {
  const at = now ?? new Date();
  const recentCutoff = cutoff(at);

  // Reduce to counts, then hand off to THE definition, the same way
  // computePanelComposition hands off to panelCompositionFromCounts.
  const cells = new Map<string, PersonTagCount>();
  for (const row of named(rows)) {
    const person = personOf(row.curator, identities);
    const key = `${person}\u0000${row.tagId}`;
    const cell = cells.get(key) ?? { person, tagId: row.tagId, base: 0, recent: 0 };
    cell.base++;
    if (toTime(row.createdAt) >= recentCutoff) cell.recent++;
    cells.set(key, cell);
  }
  return balancedVelocitiesFromCounts([...cells.values()]);
}

/** One person's applications of one tag: all-time, and inside the window. */
export type PersonTagCount = { person: string; tagId: string; base: number; recent: number };

/**
 * Curator-balanced velocity from counts alone. THE definition —
 * computeBalancedVelocities reduces rows to counts and calls this, and the
 * live pages call it with person_tag_counts_at (scripts/person-tag-counts.sql),
 * so Postgres does the counting and no curator name reaches the server.
 *
 * Grouped by PERSON, not by name — see computeBalancedVelocities above.
 */
export function balancedVelocitiesFromCounts(
  counts: PersonTagCount[]
): Map<string, number | null> {
  const byPerson = new Map<string, PersonTagCount[]>();
  for (const c of counts) {
    byPerson.set(c.person, [...(byPerson.get(c.person) ?? []), c]);
  }
  const allTagIds = new Set(counts.map((c) => c.tagId));

  // Per-curator share-shift, only for curators with enough of their own
  // history on both sides of the comparison.
  const shiftsByTag = new Map<string, number[]>();
  let qualifying = 0;

  for (const cells of byPerson.values()) {
    const baseTotal = cells.reduce((n, c) => n + c.base, 0);
    const recentTotal = cells.reduce((n, c) => n + c.recent, 0);

    if (
      baseTotal < MIN_CURATOR_BASE_VOLUME ||
      recentTotal < MIN_CURATOR_RECENT_VOLUME ||
      baseTotal - recentTotal < MIN_CURATOR_PRIOR_VOLUME
    ) {
      continue;
    }
    qualifying++;

    const mine = new Map(cells.map((c) => [c.tagId, c]));
    // Every tag in the library, not just the ones this curator touched —
    // a curator dropping a tag entirely is a real negative shift, and
    // skipping it would silently bias the mean upward.
    for (const tagId of allTagIds) {
      const c = mine.get(tagId);
      const shift = (c?.recent ?? 0) / recentTotal - (c?.base ?? 0) / baseTotal;
      shiftsByTag.set(tagId, [...(shiftsByTag.get(tagId) ?? []), shift]);
    }
  }

  const result = new Map<string, number | null>();
  for (const tagId of allTagIds) {
    if (qualifying < 2) {
      result.set(tagId, null);
      continue;
    }
    const shifts = shiftsByTag.get(tagId) ?? [];
    result.set(tagId, shifts.reduce((a, b) => a + b, 0) / shifts.length);
  }
  return result;
}

// ---------------------------------------------------------------------
// WHICH GLOBAL NUMBER PUBLISHES — added 2026-10-12
//
// The drift gate was built as a blackout: drift over 20% and every global
// figure is withheld. That was right for a two-person panel. It stops
// being right once the community grows, because every newcomer lands 100%
// inside the window and drift rises with every person who joins. On
// 2026-10-12, seven people, drift 23.8%, the radar plotted nothing.
//
// The gate's job is to stop the POOLED number describing who clipped
// rather than what moved. Balanced velocity is immune to exactly that
// confound — each person is compared with their own past, one vote each.
// So when the gate closes, the balanced reading publishes in its place.
// Withheld is now only what happens when there is no panel to balance
// (fewer than two people qualify) or a query failed.
//
// One rule, both surfaces: /radar and the Signals feed both call this.
// ---------------------------------------------------------------------

export type GlobalReading = "pooled" | "balanced" | "withheld";

export function resolveGlobalVelocity(input: {
  /** Pooled velocities from velocityFromCounts, published tags only. */
  pooled: ReadonlyMap<string, number | null>;
  /** panelCompositionFromCounts(...).safeForGlobalVelocity, failing closed. */
  panelSafe: boolean;
  /** balancedVelocitiesFromCounts(...), or null when its query failed. */
  balanced: ReadonlyMap<string, number | null> | null;
}): {
  velocities: Map<string, number | null>;
  /** What to pass getConfidence as panelSafeForGlobalVelocity. */
  panelSafe: boolean;
  reading: GlobalReading;
} {
  if (input.panelSafe) {
    return { velocities: new Map(input.pooled), panelSafe: true, reading: "pooled" };
  }
  const usable =
    input.balanced !== null && [...input.balanced.values()].some((v) => v !== null);
  if (!usable) {
    return { velocities: new Map(input.pooled), panelSafe: false, reading: "withheld" };
  }
  // Keyed by the pooled map: the published vocabulary decides which looks
  // exist. A look the balanced read has no figure for gets none — never
  // the pooled number by the back door.
  const velocities = new Map<string, number | null>();
  for (const id of input.pooled.keys()) velocities.set(id, input.balanced!.get(id) ?? null);
  return { velocities, panelSafe: true, reading: "balanced" };
}
