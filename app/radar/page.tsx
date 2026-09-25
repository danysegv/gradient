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
  "Early Signal": "Fewer than 15 references, or first seen under 45 days ago.",
  Incubating: "New vocabulary: applied to clips, outside every published figure until it graduates.",
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

  const [tagRes, panelRes, frozenAxes, prevTagRes, prevPanelRes] = await Promise.all([
    supabasePublic.rpc("tag_velocity_counts", { window_days: RECENT_WINDOW_DAYS }),
    supabasePublic.rpc("panel_composition", { window_days: RECENT_WINDOW_DAYS }),
    fetchFrozenAxes(supabasePublic),
    // The same two readings, as of a week ago — scripts/radar-week-ago.sql.
    supabasePublic.rpc("tag_velocity_counts_at", { window_days: RECENT_WINDOW_DAYS, as_of: weekAgoAt }),
    supabasePublic.rpc("panel_composition_at", { window_days: RECENT_WINDOW_DAYS, as_of: weekAgoAt }),
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
            Trend Radar — the last 30 days
          </p>
          <h1 className="mb-2.5 text-[34px] font-bold leading-tight tracking-tight">
            Where every look sits, and which way it&rsquo;s moving
          </h1>
          <p className="mb-9 max-w-xl text-[15px] leading-relaxed text-bone/75">
            Each point is a published look. Across is how much of the library it already is;
            up and down is whether its share grew or shrank this month. A look only appears once
            it has earned a number: enough references, old enough, and a panel steady enough
            to say it.
          </p>
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
                { k: "Taking share", v: String(rising) },
                { k: "Published looks", v: String(radar.publishedLooks) },
                { k: "Even split", v: formatRadarShare(radar.evenShare) },
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
                />
              </>
            ) : (
              <div className="flex aspect-[64/42] w-full max-w-[760px] flex-col items-center justify-center gap-2 border border-white/10 bg-ink-2 px-6 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-bone/75">
                  {radar.open ? "Nothing to place yet" : "Opens with the board"}
                </p>
                <p className="max-w-md text-[13px] leading-relaxed text-bone/70">
                  {radar.open
                    ? "No look has cleared every gate this month. Each one is listed below with the reason."
                    : "Saturday 26 September, 11:00 ET. Until the board publishes, no look carries a number, so there is nothing honest to place."}
                </p>
              </div>
            )}

            {radar.waiting.length > 0 && (
              <section className="mt-14 mb-16 border-t border-white/10 pt-7">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
                  Not on the radar
                </p>
                <p className="mb-6 max-w-xl text-[13px] leading-relaxed text-bone/65">
                  Left off for a stated reason, never quietly. Each still has its page and its
                  reference count.
                </p>
                <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">
                  {[...byReason.entries()].map(([reason, rows]) => (
                    <div key={reason} className="min-w-0">
                      <p
                        className={`text-[10.5px] font-semibold uppercase tracking-wide ${
                          reason === "Cooling" ? "text-slate" : "text-bone/80"
                        }`}
                      >
                        {reason}{" "}
                        <span className="font-normal tabular-nums text-bone/45">{rows.length}</span>
                      </p>
                      <p className="mb-2 text-[11.5px] leading-relaxed text-bone/50">{REASON_NOTE[reason]}</p>
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
              </section>
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
