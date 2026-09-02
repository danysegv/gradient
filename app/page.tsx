import Link from "next/link";
import { supabasePublic } from "@/lib/supabase/public";
import { getConfidence } from "@/lib/confidence";
import { confidenceNoteText } from "@/lib/confidence-display";
import { velocityFromCounts, RECENT_WINDOW_DAYS } from "@/lib/velocity";
import { panelCompositionFromCounts } from "@/lib/curator-velocity";
import { Wordmark } from "@/components/wordmark";
import { HomeGrid, type FilterTag, type GridClip } from "@/components/home-grid";

// Always fetch fresh — this is a live feed, not a static marketing page.
export const revalidate = 0;

const TRENDING_TAG_LIMIT = 8;
// Not real pagination — just a ceiling well above the current library size
// so "The Library" shows everything. Revisit (actual pagination/infinite
// scroll) once the library outgrows this.
const RECENT_CLIP_LIMIT = 200;

// As it arrives from the tag_velocity_counts RPC — counts are bigint and
// therefore strings on the wire. Coerced immediately below.
type RawTagRow = {
  tag_id: string;
  group: string;
  editorial_name: string;
  universal_term: string;
  clip_count: number | string;
  recent_count: number | string;
  earliest_reference_at: string | null;
  latest_reference_at: string | null;
};

// clip_tags is genuinely an array here (a clip has many clip_tags — a true
// to-many relation). Its nested `tags` is a single object at runtime
// despite supabase-js's type inference guessing array without generated
// Database types — same gotcha documented in app/clip/page.tsx, same fix:
// declare the real shape and cast at the query boundary.
type ClipTagRow = {
  confidence: number | null;
  tags: { editorial_name: string; group: string } | null;
};

type ClipRow = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  clipped_at: string;
  clip_tags: ClipTagRow[] | null;
};

// PostgREST serialises Postgres bigint as a JSON *string*, so every count
// coming out of these RPCs is coerced with Number() at the boundary below.
// Left as-is it would poison the arithmetic silently — "49" / "347" is NaN
// in one direction and string concatenation in the other.
type StatsRow = {
  total_clips: number | string;
  classified_clips: number | string;
};

export default async function Home() {
  const [tagCountsRes, clipsRes, statsRes, panelRes] = await Promise.all([
    // Per-tag counts, all-time and in the trailing window, aggregated in
    // Postgres. This replaced two unbounded full-table fetches on
    // 2026-08-28: the page used to pull every active clip_tags row on
    // every request and count them here. That was free at 350 rows, a
    // full-library transfer on the landing page's critical path at
    // 10,000, and — worse — silently TRUNCATED past PostgREST's max-rows
    // cap, which would have meant velocity computed on a subset of the
    // library with no error anywhere. Now ~21 rows regardless of size.
    supabasePublic.rpc("tag_velocity_counts", {
      window_days: RECENT_WINDOW_DAYS,
    }),
    supabasePublic
      .from("clips")
      .select(
        `id, url, image_url, title, source, clipped_at,
         clip_tags!inner ( confidence, tags ( editorial_name, group ) )`
      )
      .is("archived_at", null)
      .order("clipped_at", { ascending: false })
      .limit(RECENT_CLIP_LIMIT),
    supabasePublic.rpc("library_clip_stats").single(),
    // Per-curator COUNTS for the panel-drift gate. Deliberately counts and
    // not rows: the names are reduced to a single boolean here on the
    // server, so no curator identity reaches the browser. That keeps the
    // 2026-08-25 decision ("the public homepage must not select the
    // columns") intact in substance — nothing identifying is in the RSC
    // payload — while still gating a number that would otherwise describe
    // a change of curators rather than a change of taste.
    supabasePublic.rpc("curator_composition", {
      window_days: RECENT_WINDOW_DAYS,
    }),
  ]);

  // The RPC returns every tag, including seeded ones with no references
  // yet (MotionLoop, StoryScroll). Zero-count tags contribute nothing to
  // the denominators, so filtering them here is display-only and cannot
  // move a velocity figure.
  const allTags = ((tagCountsRes.data ?? []) as unknown as RawTagRow[])
    .map((t) => ({
      ...t,
      clip_count: Number(t.clip_count),
      recent_count: Number(t.recent_count),
    }))
    .filter((t) => t.clip_count > 0);
  const trendingTags = allTags.slice(0, TRENDING_TAG_LIMIT);
  const tagsInPlay = allTags.length;
  const filterTags: FilterTag[] = allTags.map((t) => ({
    tag_id: t.tag_id,
    group: t.group,
    editorial_name: t.editorial_name,
    universal_term: t.universal_term,
  }));

  // Library-wide denominators are just the column sums — every tag's
  // references, which is exactly what the formula's denominator means.
  const baseTotalRefs = allTags.reduce((n, t) => n + t.clip_count, 0);
  const recentTotalRefs = allTags.reduce((n, t) => n + t.recent_count, 0);

  const velocities = new Map<string, number | null>(
    allTags.map((t) => [
      t.tag_id,
      velocityFromCounts({
        baseRefs: t.clip_count,
        recentRefs: t.recent_count,
        baseTotalRefs,
        recentTotalRefs,
      }),
    ])
  );

  const clipRows = (clipsRes.data ?? []) as unknown as ClipRow[];
  const gridClips: GridClip[] = clipRows.map((c) => ({
    id: c.id,
    url: c.url,
    image_url: c.image_url,
    title: c.title,
    source: c.source,
    tags: (c.clip_tags ?? [])
      .filter((ct) => ct.tags !== null)
      .map((ct) => ({
        editorial_name: ct.tags!.editorial_name,
        confidence: ct.confidence ?? 0,
      })),
  }));

  // Reduced to one boolean before it is used anywhere in the tree.
  const panel = panelCompositionFromCounts(
    ((panelRes.data ?? []) as unknown as {
      curator: string;
      base_count: number | string;
      recent_count: number | string;
    }[]).map((c) => ({
      curator: c.curator,
      base: Number(c.base_count),
      recent: Number(c.recent_count),
    }))
  );
  const panelSafe = panel.safeForGlobalVelocity;

  const stats = (statsRes.data ?? {
    total_clips: 0,
    classified_clips: 0,
  }) as unknown as StatsRow;
  const totalClips = Number(stats.total_clips);
  const classifiedClips = Number(stats.classified_clips);

  return (
    <>
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-7">
        <Wordmark className="h-[22px] text-bone" />
        <nav className="flex items-center gap-7">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone">
            Signals
          </span>
          <Link
            href="/curators"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Curators
          </Link>
          {/* Radar stays an inert placeholder until velocity has a run of
              days to plot — a link to a 404 is worse than a dim word. */}
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone/55">
            Radar
          </span>
          <Link
            href="/genome"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Genome
          </Link>
          <Link
            href="/clip"
            className="rounded bg-oxide px-4 py-2 text-[13px] font-semibold tracking-wide text-bone"
          >
            + Clip
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8">
        <div className="pt-11 pb-2">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
            Signals Feed — live from the library
          </p>
          <h1 className="mb-2.5 text-[34px] font-bold leading-tight tracking-tight">
            What&rsquo;s actually moving
          </h1>
          <p className="mb-9 max-w-xl text-[15px] leading-relaxed text-bone/75">
            Not scraped, not user-generated. Every reference here was clipped by
            hand, then classified against a locked taxonomy — {classifiedClips}{" "}
            of {totalClips} clips read so far, across {tagsInPlay} tags.
          </p>
        </div>

        <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
          Trending tags
        </p>
        <div className="mb-12 flex gap-3 overflow-x-auto pb-1.5">
          {trendingTags.map((tag) => {
            const confidence = getConfidence({
              referenceCount: tag.clip_count,
              earliestReferenceAt: tag.earliest_reference_at,
              latestReferenceAt: tag.latest_reference_at,
              velocity: velocities.get(tag.tag_id) ?? null,
              panelSafeForGlobalVelocity: panelSafe,
            });
            return (
              <Link
                key={tag.tag_id}
                href={`/trend/${encodeURIComponent(tag.editorial_name)}`}
                className="w-[168px] flex-none rounded-lg border border-white/10 bg-ink-2 p-4 transition-colors hover:border-white/25"
              >
                <p className="text-[15px] font-bold leading-tight">
                  {tag.editorial_name}
                </p>
                <p className="mb-3.5 text-xs text-bone/70">
                  {tag.universal_term}
                </p>
                <p className="text-[26px] font-normal leading-none">
                  {tag.clip_count}
                </p>
                <p
                  className={`mt-2.5 border-t pt-2 text-[11px] font-semibold uppercase tracking-wide ${
                    confidence.cooling
                      ? "border-slate/40 text-slate"
                      : "border-white/10 text-bone/70"
                  }`}
                >
                  {confidenceNoteText(confidence)}
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      <HomeGrid clips={gridClips} filterTags={filterTags} />

      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8">
        <footer className="border-t border-white/10 py-10">
          <p className="max-w-xl text-xs leading-relaxed text-bone/70">
            Sources: Behance, Dribbble, Instagram, agency sites, awards
            archives. Velocity compares a tag&rsquo;s share of the last 30
            days to its share of the library overall — a tag reads Early
            Signal until its reference set is both deep enough and old
            enough to mean anything.
          </p>
        </footer>
      </div>
    </>
  );
}
