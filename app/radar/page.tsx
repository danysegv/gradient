import Link from "next/link";
import { supabasePublic } from "@/lib/supabase/public";
import { fetchFrozenAxes } from "@/lib/taxonomy-freeze";
import { RECENT_WINDOW_DAYS } from "@/lib/velocity";
import { panelCompositionFromCounts } from "@/lib/curator-velocity";
import { loaded, LIBRARY_UNAVAILABLE } from "@/lib/query-result";
import { AXIS_LABEL } from "@/lib/axes";
import {
  attachTrail,
  computeTrendRadar,
  formatRadarShare,
  RADAR_QUADRANT_LABEL,
  TRAIL_DAYS,
  type RadarTagInput,
  type WaitingReason,
  type RadarWaiting,
} from "@/lib/radar/trend-radar";
import { computeMarketOverlay, type MarketOverlay } from "@/lib/market/overlay";
import { SiteHeader } from "@/components/site-header";
import { TrendRadarChart } from "@/components/radar/trend-radar-chart";

// Live, like the feed: the radar is a reading of today.
export const revalidate = 0;

export const metadata = {
  title: "Trend Radar — 04AM",
  description: "Every published look, by how much of the library it is and which way it is moving.",
};

type RawTagRow = {
  tag_id: string;
  group: string;
  editorial_name: string;
  clip_count: number | string;
  recent_count: number | string;
  earliest_reference_at: string | null;
  latest_reference_at: string | null;
  is_published: boolean;
};

// Why a look is not on the chart, in one line each. Order follows the
// waiting list, which puts the reasons that apply to everything first.
const REASON_NOTE: Record<WaitingReason, string> = {
  "Opens with the board":
    "The radar publishes with the board, Saturday 26 September at 11:00 ET. Before then no look carries a published number.",
  Withheld: "Held back from the published board.",
  "Panel Skew":
    "This month's clipping came from a different mix of curators than the library as a whole, so a library-wide shift would describe who clipped, not what moved.",
  "Thin window": "Too few references across the library in the last 30 days to trust a share.",
  Cooling: "No new reference in 30 days.",
  "Early Signal": "Fewer than 15 references, or first seen under 30 days ago.",
  Incubating: "New vocabulary: applied to clips, outside every published figure until it graduates.",
};

// The reason in a few words, beside its name; the full sentence is on hover.
const REASON_SHORT: Record<WaitingReason, string> = {
  "Opens with the board": "not yet published",
  Withheld: "held back",
  "Panel Skew": "curator mix shifted",
  "Thin window": "too quiet this month",
  Cooling: "nothing new in 30 days",
  "Early Signal": "too few or too new",
  Incubating: "new vocabulary",
};

// Local preview only: lets `next dev` show the radar as it will read after
// the board publishes. Ignored in production builds, so it can never open
// the radar early on the live site.
function renderNow(): number {
  const preview = process.env.RADAR_PREVIEW_AT;
  if (process.env.NODE_ENV !== "production" && preview) {
    const t = Date.parse(preview);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

const MARKET_WINDOW_DAYS = 90;

type RawMarketCount = { tag_id: string; recent_count: number | string };
type RawMarketSource = {
  source_id: string;
  name: string;
  homepage: string;
  series: "market" | "archive";
  enabled: boolean;
  paused_reason: string | null;
  last_polled_at: string | null;
  items_read: number | string;
};

// Local preview only, like RADAR_PREVIEW_AT: lets `next dev` draw the
// market from its first few real items. Ignored in production, so the live
// floor is always MARKET_FLOOR_ITEMS.
function marketFloor(): number | undefined {
  const n = Number(process.env.MARKET_PREVIEW_FLOOR);
  return process.env.NODE_ENV !== "production" && Number.isFinite(n) && n > 0 ? n : undefined;
}

type RawPanelRow = { person: string; base_count: number | string; recent_count: number | string };

const toInput = (t: RawTagRow): RadarTagInput => ({
  id: t.tag_id,
  name: t.editorial_name,
  group: t.group,
  refs: Number(t.clip_count),
  recentRefs: Number(t.recent_count),
  earliestReferenceAt: t.earliest_reference_at,
  latestReferenceAt: t.latest_reference_at,
  isPublished: t.is_published,
});

// Fails closed, exactly as the feed does: unknown drift is not safe drift.
function panelSafeFrom(label: string, res: { data: unknown; error: { message: string } | null }) {
  const load = loaded<RawPanelRow>(label, res);
  const panel = panelCompositionFromCounts(
    load.rows.map((c) => ({ person: c.person, base: Number(c.base_count), recent: Number(c.recent_count) }))
  );
  return !load.failed && panel.safeForGlobalVelocity;
}

export default async function RadarPage() {
  const now = renderNow();
  const weekAgoAt = new Date(now - TRAIL_DAYS * 86_400_000).toISOString();

  const [tagRes, panelRes, frozenAxes, prevTagRes, prevPanelRes, marketRes, sourcesRes, lib90Res] = await Promise.all([
    supabasePublic.rpc("tag_velocity_counts", { window_days: RECENT_WINDOW_DAYS }),
    supabasePublic.rpc("panel_composition", { window_days: RECENT_WINDOW_DAYS }),
    fetchFrozenAxes(supabasePublic),
    // The same two readings, as of a week ago — scripts/radar-week-ago.sql.
    supabasePublic.rpc("tag_velocity_counts_at", { window_days: RECENT_WINDOW_DAYS, as_of: weekAgoAt }),
    supabasePublic.rpc("panel_composition_at", { window_days: RECENT_WINDOW_DAYS, as_of: weekAgoAt }),
    // The market series — scripts/market.sql. Aggregates only. Three
    // months on both sides: the market is kept the same size as the
    // library over the same span (lib/market/plan.ts).
    supabasePublic.rpc("market_tag_counts", { window_days: MARKET_WINDOW_DAYS }),
    supabasePublic.rpc("market_status", { window_days: MARKET_WINDOW_DAYS }),
    supabasePublic.rpc("tag_velocity_counts", { window_days: MARKET_WINDOW_DAYS }),
  ]);

  const tagLoad = loaded<RawTagRow>("tag_velocity_counts", tagRes);
  const radar = computeTrendRadar({
    tags: tagLoad.rows.map(toInput),
    panelSafe: panelSafeFrom("panel_composition", panelRes),
    frozenAxes,
    now,
  });

  // Last week, read by today's rules and today's publication gate. If
  // either query fails there is simply no trail: the radar itself never
  // depends on it.
  const prevLoad = loaded<RawTagRow>("tag_velocity_counts_at", prevTagRes);
  const weekAgo = prevLoad.failed
    ? null
    : computeTrendRadar({
        tags: prevLoad.rows.map(toInput),
        panelSafe: panelSafeFrom("panel_composition_at", prevPanelRes),
        frozenAxes,
        now: now - TRAIL_DAYS * 86_400_000,
        publicationNow: now,
      });
  const weekly = attachTrail(radar, weekAgo);

  // The market, against the library, like for like. A failed query means
  // no overlay and says so; it never reads as a market with nothing in it.
  const marketLoad = loaded<RawMarketCount>("market_tag_counts", marketRes);
  const sourcesLoad = loaded<RawMarketSource>("market_status", sourcesRes);
  const lib90Load = loaded<RawTagRow>("tag_velocity_counts (90 days)", lib90Res);
  const marketSources = sourcesLoad.rows.filter((s) => s.series === "market");
  const itemsRead = marketSources.reduce((n, s) => n + Number(s.items_read), 0);
  const overlay: MarketOverlay | null =
    marketLoad.failed || sourcesLoad.failed || lib90Load.failed
      ? null
      : computeMarketOverlay({
          marketCounts: new Map(marketLoad.rows.map((r) => [r.tag_id, Number(r.recent_count)])),
          itemsRead,
          libraryRecent: new Map(
            lib90Load.rows.filter((t) => t.is_published).map((t) => [t.tag_id, Number(t.recent_count)])
          ),
        }, marketFloor());
  const marketShare = overlay?.open ? Object.fromEntries(overlay.share) : null;
  const nameOf = new Map(tagLoad.rows.map((t) => [t.tag_id, t.editorial_name]));

  const rising = radar.points.filter((p) => p.shift > 0).length;
  const byReason = new Map<WaitingReason, RadarWaiting[]>();
  for (const w of radar.waiting) {
    byReason.set(w.reason, [...(byReason.get(w.reason) ?? []), w]);
  }

  return (
    <>
      <SiteHeader active="radar" />

      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-4 sm:px-8">
        <div className="pt-11 pb-2">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
            Trend Radar · 30 days
          </p>
          {/* Less said, more shown (Daniela, 2026-10-01): the chart's axes,
              legend and quadrant names carry the explanation. */}
          <h1 className="mb-9 text-[34px] font-bold leading-tight tracking-tight">What&rsquo;s moving</h1>
        </div>

        {tagLoad.failed ? (
          <p className="mb-16 border-y border-white/10 py-10 text-[14px] text-bone/75">
            {LIBRARY_UNAVAILABLE}
          </p>
        ) : (
          <>
            <dl className="mb-10 flex flex-wrap gap-x-14 gap-y-6 border-y border-white/10 py-6">
              {[
                { k: "On the radar", v: String(radar.points.length) },
                { k: "Gaining", v: String(rising) },
                { k: "Looks", v: String(radar.publishedLooks) },
              ].map(({ k, v }) => (
                <div key={k}>
                  <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">{k}</dt>
                  <dd className="text-[26px] font-normal leading-none tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>

            {radar.points.length > 0 ? (
              <>
                <WeekLine weekly={weekly} />
                <TrendRadarChart
                  points={weekly.points}
                  evenShare={radar.evenShare}
                  hasTrail={weekly.hasTrail}
                  market={marketShare}
                />
              </>
            ) : (
              <div className="flex aspect-[64/42] w-full max-w-[760px] flex-col items-center justify-center gap-2 border border-white/10 bg-ink-2 px-6 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-bone/75">
                  {radar.open ? "Nothing to place yet" : "Opens with the board"}
                </p>
                <p className="max-w-md text-[13px] leading-relaxed text-bone/70">
                  {radar.open ? "No look has enough this month yet." : "Opens with the board."}
                </p>
              </div>
            )}

            <MarketSection
              overlay={overlay}
              sources={sourcesLoad.rows}
              nameOf={nameOf}
              onRadar={new Set(radar.points.map((p) => p.id))}
            />

            {radar.waiting.length > 0 && (
              // Folded away: what is NOT on the chart is a footnote, not the
              // page. Every look is still named, with a short reason and the
              // full one on hover.
              <details className="group mt-14 mb-16 border-t border-white/10 pt-6">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/70 hover:text-bone [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
                  Not on the radar
                  <span className="font-normal tabular-nums text-bone/45">{radar.waiting.length}</span>
                </summary>
                <div className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
                  {[...byReason.entries()].map(([reason, rows]) => (
                    <div key={reason} className="min-w-0">
                      <p
                        title={REASON_NOTE[reason]}
                        className={`mb-2 text-[10.5px] font-semibold uppercase tracking-wide ${
                          reason === "Cooling" ? "text-slate" : "text-bone/80"
                        }`}
                      >
                        {reason}
                        <span className="ml-2 font-normal normal-case tracking-normal text-bone/45">
                          {REASON_SHORT[reason]}
                        </span>
                      </p>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {rows.map((w) => (
                          <li key={w.id} className="text-[12px]">
                            <Link
                              href={`/trend/${encodeURIComponent(w.name)}`}
                              className="text-bone/85 hover:text-bone"
                              title={AXIS_LABEL[w.group] ?? w.group}
                            >
                              {w.name}
                            </Link>{" "}
                            <span className="tabular-nums text-bone/45">{w.refs}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </>
  );
}

// One sentence on the week, above the chart. Names what crossed a line
// first, since that is the news; otherwise the look that moved furthest.
function WeekLine({ weekly }: { weekly: ReturnType<typeof attachTrail> }) {
  const Q = RADAR_QUADRANT_LABEL;
  let text: React.ReactNode;
  if (!weekly.hasTrail) {
    text = "The weekly trail starts once a look has been on the radar for a week.";
  } else if (weekly.crossings.length > 0) {
    const c = weekly.crossings.slice(0, 2);
    text = (
      <>
        {c.map((m, i) => (
          <span key={m.id}>
            {i > 0 && "; "}
            <span className="font-semibold text-bone">{m.name}</span> moved from {Q[m.from]} to{" "}
            {Q[m.to]}
          </span>
        ))}
        {weekly.crossings.length > 2 && `, and ${weekly.crossings.length - 2} more`}.
      </>
    );
  } else if (weekly.biggestMover) {
    text = (
      <>
        Every look held its quadrant.{" "}
        <span className="font-semibold text-bone">{weekly.biggestMover.name}</span> moved furthest,{" "}
        {weekly.biggestMover.delta > 0 ? "taking share" : "giving share back"}.
      </>
    );
  } else {
    text = "Nothing moved.";
  }
  return (
    <p className="mb-6 max-w-2xl text-[14px] leading-relaxed text-bone/75">
      <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-bone/60">
        This week
      </span>
      {text}
    </p>
  );
}

function Gap({
  rows,
  label,
  note,
  nameOf,
}: {
  rows: { id: string; library: number; market: number }[];
  label: string;
  note: string;
  nameOf: Map<string, string>;
}) {
  if (rows.length === 0) return null;
  return (
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-bone/80">{label}</p>
        <p className="mb-2 text-[11.5px] leading-relaxed text-bone/50">{note}</p>
        <ul className="divide-y divide-white/[.07]">
          {rows.slice(0, 6).map((g) => (
            <li key={g.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-2">
              <Link
                href={`/trend/${encodeURIComponent(nameOf.get(g.id) ?? "")}`}
                className="truncate text-[11px] font-semibold uppercase tracking-wide text-bone hover:opacity-80"
              >
                {nameOf.get(g.id) ?? "—"}
              </Link>
              <span className="text-right text-[12px] tabular-nums text-bone/70">
                04AM {formatRadarShare(g.library)} <span className="text-bone/40">·</span> market{" "}
                {formatRadarShare(g.market)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
}

// The market, against the library. Shown only once it has something to
// say: while it is gathering, or if its query fails, the section is simply
// absent (Daniela, 2026-09-28 — the page is for readers, not a status
// board). Sources are named in one line; their review, pauses and counts
// live in market_sources, for the operator.
function MarketSection({
  overlay,
  sources,
  nameOf,
  onRadar,
}: {
  overlay: MarketOverlay | null;
  sources: RawMarketSource[];
  nameOf: Map<string, string>;
  /**
   * Only looks already on the radar are named. A withheld, early or
   * incubating look has no published figure, and a market comparison
   * would publish one by the side door.
   */
  onRadar: Set<string>;
}) {
  if (!overlay?.open) return null;
  const ahead = overlay.ahead.filter((g) => onRadar.has(g.id));
  const behind = overlay.behind.filter((g) => onRadar.has(g.id));
  const read = sources.filter((s) => s.series === "market" && Number(s.items_read) > 0);

  return (
    <section className="mt-14 border-t border-white/10 pt-7">
      <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/70">
        <span aria-hidden className="inline-block h-2 w-2 border border-bone/70" />
        The market
      </p>
      <p className="mb-6 max-w-xl text-[13px] leading-relaxed text-bone/65">
        Same looks, the design press, last three months.
      </p>

      {ahead.length + behind.length > 0 ? (
        <div className="mb-8 grid gap-x-10 gap-y-7 md:grid-cols-2">
          <Gap nameOf={nameOf} rows={ahead} label="Ahead of the market" note="Bigger here than in the press." />
          <Gap nameOf={nameOf} rows={behind} label="The market has more" note="Bigger in the press than here." />
        </div>
      ) : (
        <p className="mb-8 text-[13px] text-bone/60">04AM and the market agree, within two points on every look.</p>
      )}

      {read.length > 0 && (
        <p className="max-w-2xl text-[11.5px] leading-relaxed text-bone/50">
          Read from{" "}
          {read.map((s, i) => (
            <span key={s.source_id}>
              {i > 0 && (i === read.length - 1 ? " and " : ", ")}
              <a href={s.homepage} rel="noopener" className="text-bone/70 hover:text-bone">
                {s.name}
              </a>
            </span>
          ))}
          .
        </p>
      )}
    </section>
  );
}
