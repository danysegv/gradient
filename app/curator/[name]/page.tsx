import Link from "next/link";
import { notFound } from "next/navigation";
import { supabasePublic } from "@/lib/supabase/public";
import { getConfidence } from "@/lib/confidence";
import { confidenceNoteText } from "@/lib/confidence-display";
import { velocityFromCounts, RECENT_WINDOW_DAYS } from "@/lib/velocity";
import { Wordmark } from "@/components/wordmark";
import { HomeGrid, type FilterTag, type GridClip } from "@/components/home-grid";

// Live, like the Signals Feed. Not a static profile page.
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  // Resolve to the canonical spelling rather than echoing the URL — a
  // request for /curator/LuMaLhAeS must not title the tab "LuMaLhAeS"
  // while the page itself renders "lumalhaes". One extra count-only RPC.
  const { data } = await supabasePublic
    .rpc("curator_clip_stats", { curator_name: decodeURIComponent(name) })
    .single();
  const who =
    (data as unknown as { curator: string | null } | null)?.curator ?? null;
  // No match means this request is about to 404 — do not title the tab
  // with the string the visitor mistyped.
  return {
    title: who ? `${who} — 04AM` : "Not found — 04AM",
    // Curator pages are a real product surface but not one to hand to
    // crawlers before the invite model is designed. Revisit alongside the
    // curator-privacy decision (see claude/04am-new-chat-summary.md).
    robots: { index: false, follow: false },
  };
}

const TAG_RAIL_LIMIT = 8;
const CLIP_LIMIT = 200;

// clip_tags is a true to-many relation; its nested `tags` is a single
// object at runtime despite supabase-js inferring an array without
// generated Database types. Same gotcha and same fix as app/page.tsx.
// PostgREST serialises bigint as a JSON string — every count out of these
// RPCs is coerced with Number() at the boundary. Left alone it would
// poison the arithmetic silently rather than throwing.
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

type CuratorStatsRow = {
  curator: string | null;
  total_clips: number | string;
  classified_clips: number | string;
  first_clipped_at: string | null;
};

type ClipTagRow = {
  confidence: number | null;
  tags: {
    editorial_name: string;
    universal_term: string;
    group: string;
  } | null;
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

export default async function CuratorPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const requested = decodeURIComponent(name);

  // Resolve the URL segment to a canonical stored name. The match is
  // case-insensitive but done with = on lower() inside the RPC, never
  // LIKE/ilike: the segment comes from a URL and % / _ are wildcards
  // there, so an ilike would let /curator/%25 match every curator at once.
  // An unknown name comes back with a null curator, which is the 404.
  const { data: statsRow } = await supabasePublic
    .rpc("curator_clip_stats", { curator_name: requested })
    .single();
  const stats = statsRow as unknown as CuratorStatsRow | null;
  if (!stats?.curator) notFound();
  const curator = stats.curator;

  const [clipsRes, tagCountsRes, libraryCountsRes] = await Promise.all([
    // The only row-level query on this page, and deliberately capped —
    // CLIP_LIMIT is display pagination, not an accident.
    supabasePublic
      .from("clips")
      .select(
        `id, url, image_url, title, source, clipped_at,
         clip_tags!inner ( confidence,
           tags ( editorial_name, universal_term, group ) )`
      )
      .eq("clipped_by_name", curator)
      .is("archived_at", null)
      .order("clipped_at", { ascending: false })
      .limit(CLIP_LIMIT),
    // Their per-tag counts, aggregated in Postgres. Previously this page
    // derived them from the capped clips query above, which meant a
    // curator past CLIP_LIMIT would have had their velocity computed on
    // the most recent 200 clips only — silently, with no error.
    supabasePublic.rpc("curator_tag_counts", {
      curator_name: curator,
      window_days: RECENT_WINDOW_DAYS,
    }),
    // Library-wide totals for the share figure. ~21 rows.
    supabasePublic.rpc("tag_velocity_counts", {
      window_days: RECENT_WINDOW_DAYS,
    }),
  ]);

  const clips = (clipsRes.data ?? []) as unknown as ClipRow[];
  const totalClips = Number(stats.total_clips);
  const classifiedClips = Number(stats.classified_clips);

  const tagStats = ((tagCountsRes.data ?? []) as unknown as RawTagRow[])
    .map((t) => ({
      ...t,
      clip_count: Number(t.clip_count),
      recent_count: Number(t.recent_count),
    }))
    .filter((t) => t.clip_count > 0);

  // Their own denominators — this page compares a person against
  // themselves, so the totals are theirs, not the library's.
  const theirBaseRefs = tagStats.reduce((n, t) => n + t.clip_count, 0);
  const theirRecentRefs = tagStats.reduce((n, t) => n + t.recent_count, 0);

  const velocities = new Map<string, number | null>(
    tagStats.map((t) => [
      t.tag_id,
      velocityFromCounts({
        baseRefs: t.clip_count,
        recentRefs: t.recent_count,
        baseTotalRefs: theirBaseRefs,
        recentTotalRefs: theirRecentRefs,
      }),
    ])
  );

  const libraryApplications = (
    (libraryCountsRes.data ?? []) as unknown as RawTagRow[]
  ).reduce((n, t) => n + Number(t.clip_count), 0);


  const gridClips: GridClip[] = clips.map((c) => ({
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
  const filterTags: FilterTag[] = tagStats.map((t) => ({
    tag_id: t.tag_id,
    group: t.group,
    editorial_name: t.editorial_name,
    universal_term: t.universal_term,
  }));

  const share =
    libraryApplications === 0
      ? 0
      : Math.round((theirBaseRefs / libraryApplications) * 100);
  // From the RPC, not the tail of the capped clips query — that would have
  // shown the oldest of the most recent 200 clips and called it "since".
  const firstClip = stats.first_clipped_at
    ? new Date(stats.first_clipped_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

  return (
    <>
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-7">
        <Link href="/" aria-label="04AM — Signals Feed">
          <Wordmark className="h-[22px] text-bone" />
        </Link>
        <nav className="flex items-center gap-7">
          <Link
            href="/"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Signals
          </Link>
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone">
            Curator
          </span>
          <Link
            href="/clip"
            className="rounded bg-oxide px-4 py-2 text-[13px] font-semibold tracking-wide text-bone"
          >
            + Clip
          </Link>
        </nav>
      </header>

      <div className="mx-auto max-w-[1180px] px-8">
        <div className="pt-11 pb-2">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
            Curator — live from the library
          </p>
          <h1 className="mb-2.5 text-[34px] font-bold leading-tight tracking-tight">
            {curator}
          </h1>
          <p className="mb-9 max-w-xl text-[15px] leading-relaxed text-bone/75">
            Every number on this page is scoped to {curator}. Velocity here
            compares their share of what they clipped in the last 30 days
            against their share of everything they have ever clipped — a claim
            about one person&rsquo;s attention, not about the culture.
            {totalClips > classifiedClips && (
              <> {classifiedClips} of {totalClips} clips classified so far.</>
            )}
          </p>
        </div>

        <dl className="mb-12 flex flex-wrap gap-x-14 gap-y-6 border-y border-white/10 py-6">
          {[
            { k: "Clips", v: String(totalClips) },
            { k: "Tag applications", v: String(theirBaseRefs) },
            { k: "Share of library", v: `${share}%` },
            { k: "Clipping since", v: firstClip },
          ].map(({ k, v }) => (
            <div key={k}>
              <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
                {k}
              </dt>
              <dd className="text-[26px] font-normal leading-none">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
          Their tags
        </p>
        <div className="mb-12 flex gap-3 overflow-x-auto pb-1.5">
          {tagStats.slice(0, TAG_RAIL_LIMIT).map((tag) => {
            const confidence = getConfidence({
              referenceCount: tag.clip_count,
              earliestReferenceAt: tag.earliest_reference_at,
              latestReferenceAt: tag.latest_reference_at,
              velocity: velocities.get(tag.tag_id) ?? null,
              // Deliberately absent: panelSafeForGlobalVelocity. The panel
              // gate exists to stop a GLOBAL number describing a change of
              // curators rather than a change of taste. A number scoped to
              // one person cannot have that problem, so gating it here
              // would be withholding a true figure for no reason.
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

      <div className="mx-auto max-w-[1180px] px-8">
        <footer className="border-t border-white/10 py-10">
          <p className="max-w-xl text-xs leading-relaxed text-bone/70">
            A curator page reads one person&rsquo;s library against itself.
            The Signals Feed reads the whole library — a different question,
            and one that needs more than one curator before it can be
            answered honestly.
          </p>
        </footer>
      </div>
    </>
  );
}
