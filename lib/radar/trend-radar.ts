// The Trend Radar: every published look in the library, placed by how much
// of the library it is (across) and which way its share moved in the last
// 30 days (up and down). Pure, so the rules are tested, not assumed.
//
// It draws in the same hand as the plate radar (components/boards/
// board-radar.tsx) but reads a different thing. The plate radar is
// composition against the library and never a trend; this one IS the trend,
// and it quotes nothing the rest of the product does not already quote:
//
// - Share: a tag's references over every published reference, all-time.
//   This is `baseShare` in lib/velocity.ts, the same denominator.
// - Shift: velocityFromCounts, the one definition. Not recomputed here.
// - A point is plotted only when getConfidence clears its velocity for
//   display AND publishedVelocities lets it through: nothing before the
//   board publishes, never a withheld tag. Early Signal, Cooling,
//   Incubating and Panel Skew tags are listed under the chart with the
//   reason, so the radar hides nothing it leaves out.
// - The vertical line is the even split: 1 / the number of published looks
//   with any reference. Right of it, a look holds more than its fair share
//   of the library. It moves as the vocabulary grows, which is the point:
//   "big" means big relative to how many looks there are.
//
// Quadrant words are a starting point, like the confidence bands. They
// live in RADAR_QUADRANT_LABEL only; no surface spells them itself.

import { getConfidence } from "../confidence.ts";
import { velocityFromCounts } from "../velocity.ts";
import {
  BOARD_PUBLISHES_AT,
  publishedVelocities,
  WITHHELD_TAG_IDS,
} from "../publication.ts";

export type RadarQuadrant = "leading" | "established" | "emerging" | "receding";

export const RADAR_QUADRANT_LABEL: Record<RadarQuadrant, string> = {
  leading: "Leading",
  established: "Established",
  emerging: "Emerging",
  receding: "Receding",
};

/** What each quadrant means, in one line, for the legend. */
export const RADAR_QUADRANT_NOTE: Record<RadarQuadrant, string> = {
  leading: "A large share of the library, and growing.",
  established: "A large share of the library, giving some back.",
  emerging: "Small for now, and taking share.",
  receding: "Small, and losing share.",
};

export type RadarTagInput = {
  id: string;
  name: string;
  group: string;
  refs: number;
  recentRefs: number;
  earliestReferenceAt: string | null;
  latestReferenceAt: string | null;
  isPublished: boolean;
};

export type RadarPoint = {
  id: string;
  name: string;
  group: string;
  refs: number;
  /** Share of every published reference, all-time. 0–1. */
  share: number;
  /** The cleared, published velocity. A fraction: 0.012 is +1.2 points. */
  shift: number;
  quadrant: RadarQuadrant;
};

export type WaitingReason =
  | "Opens with the board"
  | "Withheld"
  | "Incubating"
  | "Cooling"
  | "Early Signal"
  | "Panel Skew"
  | "Thin window";

export type RadarPrior = {
  share: number;
  shift: number;
  quadrant: RadarQuadrant;
};

export type RadarWaiting = {
  id: string;
  name: string;
  group: string;
  refs: number;
  reason: WaitingReason;
};

export type TrendRadar = {
  /** False until the board publishes. Nothing is plotted before. */
  open: boolean;
  /** 1 / published looks with any reference; the quadrant line. */
  evenShare: number;
  publishedLooks: number;
  points: RadarPoint[];
  waiting: RadarWaiting[];
};

export function radarQuadrant(share: number, shift: number, evenShare: number): RadarQuadrant {
  const large = share >= evenShare;
  const up = shift > 0;
  if (large) return up ? "leading" : "established";
  return up ? "emerging" : "receding";
}

export function computeTrendRadar(input: {
  tags: RadarTagInput[];
  /** panelCompositionFromCounts(...).safeForGlobalVelocity, failing closed. */
  panelSafe: boolean;
  frozenAxes: ReadonlySet<string>;
  now: number;
  /**
   * The instant the publication gate is read at. Defaults to `now`. The
   * weekly trail reads last week's positions (`now` = a week ago) against
   * TODAY's gate: once the radar is open, where a look sat last week is
   * history of a published figure, not a figure released early.
   */
  publicationNow?: number;
}): TrendRadar {
  const tags = input.tags.filter((t) => t.refs > 0);
  const published = tags.filter((t) => t.isPublished);

  // Denominators over the PUBLISHED vocabulary only — the same sums the
  // Signals feed makes. Summing every tag would readmit incubating
  // applications and dilute every incumbent without any error.
  const baseTotal = published.reduce((n, t) => n + t.refs, 0);
  const recentTotal = published.reduce((n, t) => n + t.recentRefs, 0);
  const evenShare = published.length > 0 ? 1 / published.length : 0;

  const cleared = new Map<string, number>();
  const labels = new Map<string, WaitingReason>();
  for (const t of tags) {
    const raw = t.isPublished
      ? velocityFromCounts({
          baseRefs: t.refs,
          recentRefs: t.recentRefs,
          baseTotalRefs: baseTotal,
          recentTotalRefs: recentTotal,
        })
      : null;
    const c = getConfidence({
      referenceCount: t.refs,
      earliestReferenceAt: t.earliestReferenceAt,
      latestReferenceAt: t.latestReferenceAt,
      velocity: raw,
      panelSafeForGlobalVelocity: input.panelSafe,
      coolingSuspended: input.frozenAxes.has(t.group),
      isPublished: t.isPublished,
      now: new Date(input.now),
    });
    if (c.velocity !== null) cleared.set(t.id, c.velocity);
    else labels.set(t.id, c.label ?? "Thin window");
  }

  const gateAt = input.publicationNow ?? input.now;
  const published_ = publishedVelocities(cleared, gateAt);
  const open = gateAt >= BOARD_PUBLISHES_AT;

  const points: RadarPoint[] = [];
  const waiting: RadarWaiting[] = [];
  for (const t of tags) {
    const shift = published_.get(t.id);
    if (shift !== undefined && baseTotal > 0) {
      const share = t.refs / baseTotal;
      points.push({
        id: t.id,
        name: t.name,
        group: t.group,
        refs: t.refs,
        share,
        shift,
        quadrant: radarQuadrant(share, shift, evenShare),
      });
      continue;
    }
    // Why it is not on the chart. A cleared velocity that did not survive
    // publication is either "not yet" or "withheld"; anything else carries
    // the confidence label that stopped it.
    const reason: WaitingReason = cleared.has(t.id)
      ? WITHHELD_TAG_IDS.has(t.id) && open
        ? "Withheld"
        : "Opens with the board"
      : (labels.get(t.id) ?? "Thin window");
    waiting.push({ id: t.id, name: t.name, group: t.group, refs: t.refs, reason });
  }

  points.sort((a, b) => b.shift - a.shift || a.name.localeCompare(b.name));
  waiting.sort(
    (a, b) =>
      WAITING_ORDER.indexOf(a.reason) - WAITING_ORDER.indexOf(b.reason) ||
      b.refs - a.refs ||
      a.name.localeCompare(b.name)
  );

  return { open, evenShare, publishedLooks: published.length, points, waiting };
}

const WAITING_ORDER: WaitingReason[] = [
  "Opens with the board",
  "Withheld",
  "Panel Skew",
  "Thin window",
  "Cooling",
  "Early Signal",
  "Incubating",
];

/** "14%"; under 10% gets one decimal, "4.5%", since most looks live there. */
export function formatRadarShare(share: number): string {
  const pct = share * 100;
  return pct >= 10 ? `${Math.round(pct)}%` : `${(Math.round(pct * 10) / 10).toFixed(1)}%`;
}

// ---------------------------------------------------------------------
// THE WEEKLY TRAIL
//
// The radar is re-read on every request over a rolling 30-day window, so
// it never waits a month to change. What a week adds is memory: where each
// look sat seven days ago, read by exactly the same rules as of then
// (tag_velocity_counts_at / panel_composition_at, scripts/radar-week-ago.sql).
// The window stays 30 days on purpose. A 7-day window would rest most
// looks on two or three clips; a 30-day reading taken weekly moves slowly
// and means it.
//
// A look gets a trail only if it was ALSO on the radar a week ago, having
// cleared every gate as of then. Otherwise it is "new this week", which is
// true and needs no number.
// ---------------------------------------------------------------------

export const TRAIL_DAYS = 7;

export type TrailedPoint = RadarPoint & { prior: RadarPrior | null };

export type WeekMove = {
  id: string;
  name: string;
  from: RadarQuadrant;
  to: RadarQuadrant;
};

export type WeeklyRadar = {
  points: TrailedPoint[];
  /** True when at least one look has a position a week ago. */
  hasTrail: boolean;
  /** Looks that changed quadrant this week, biggest move first. */
  crossings: WeekMove[];
  /** The look whose change in share moved furthest, crossing or not. */
  biggestMover: { id: string; name: string; delta: number } | null;
};

export function attachTrail(current: TrendRadar, weekAgo: TrendRadar | null): WeeklyRadar {
  const before = new Map((weekAgo?.points ?? []).map((p) => [p.id, p]));
  const points: TrailedPoint[] = current.points.map((p) => {
    const b = before.get(p.id);
    return { ...p, prior: b ? { share: b.share, shift: b.shift, quadrant: b.quadrant } : null };
  });
  const trailed = points.filter((p) => p.prior !== null);
  const delta = (p: TrailedPoint) => p.shift - p.prior!.shift;
  const byMove = [...trailed].sort(
    (a, b) => Math.abs(delta(b)) - Math.abs(delta(a)) || a.name.localeCompare(b.name)
  );
  const crossings = byMove
    .filter((p) => p.prior!.quadrant !== p.quadrant)
    .map((p) => ({ id: p.id, name: p.name, from: p.prior!.quadrant, to: p.quadrant }));
  const top = byMove[0];
  return {
    points,
    hasTrail: trailed.length > 0,
    crossings,
    biggestMover: top && delta(top) !== 0 ? { id: top.id, name: top.name, delta: delta(top) } : null,
  };
}
