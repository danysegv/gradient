import { supabasePublic } from "@/lib/supabase/public";
import { getConfidence, type ConfidenceState } from "@/lib/confidence";
import { Wordmark } from "@/components/wordmark";
import { HomeGrid, type FilterTag, type GridClip } from "@/components/home-grid";

// Always fetch fresh — this is a live feed, not a static marketing page.
export const revalidate = 0;

const TRENDING_TAG_LIMIT = 8;
// Not real pagination — just a ceiling well above the current library size
// so "The Library" shows everything. Revisit (actual pagination/infinite
// scroll) once the library outgrows this.
const RECENT_CLIP_LIMIT = 200;

type TagRow = {
  tag_id: string;
  group: string;
  editorial_name: string;
  universal_term: string;
  clip_count: number;
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

type StatsRow = {
  id: string;
  clip_tags: { clip_id: string }[] | null;
};

function confidenceNoteText(state: ConfidenceState): string {
  if (state.label) return state.label;
  if (state.velocity !== null) {
    const pct = Math.round(state.velocity * 100);
    return `${pct > 0 ? "+" : ""}${pct}% · 90d`;
  }
  // Age- and count-eligible, but no velocity figure has been computed yet
  // (the trailing-90-day formula isn't built) — show something true
  // rather than nothing.
  return `${state.referenceCount} references`;
}

export default async function Home() {
  const [allTagsRes, clipsRes, statsRes] = await Promise.all([
    supabasePublic
      .from("tag_clip_counts")
      .select(
        "tag_id, group, editorial_name, universal_term, clip_count, earliest_reference_at, latest_reference_at"
      )
      .gt("clip_count", 0)
      .order("clip_count", { ascending: false }),
    supabasePublic
      .from("clips")
      .select(
        `id, url, image_url, title, source, clipped_at,
         clip_tags!inner ( confidence, tags ( editorial_name, group ) )`
      )
      .is("archived_at", null)
      .order("clipped_at", { ascending: false })
      .limit(RECENT_CLIP_LIMIT),
    supabasePublic
      .from("clips")
      .select("id, clip_tags ( clip_id )")
      .is("archived_at", null),
  ]);

  const allTags = (allTagsRes.data ?? []) as unknown as TagRow[];
  const trendingTags = allTags.slice(0, TRENDING_TAG_LIMIT);
  const tagsInPlay = allTags.length;
  const filterTags: FilterTag[] = allTags.map((t) => ({
    tag_id: t.tag_id,
    group: t.group,
    editorial_name: t.editorial_name,
  }));

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

  const statsRows = (statsRes.data ?? []) as unknown as StatsRow[];
  const totalClips = statsRows.length;
  const classifiedClips = statsRows.filter(
    (c) => (c.clip_tags?.length ?? 0) > 0
  ).length;

  return (
    <>
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-7">
        <Wordmark className="h-[22px] text-bone" />
        <nav className="flex items-center gap-7">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone">
            Signals
          </span>
          {/* Radar and Genome are locked V1 scope but not built yet —
              inert placeholders rather than links to routes that 404. */}
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone/55">
            Radar
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone/55">
            Genome
          </span>
          <a
            href="/clip"
            className="rounded bg-oxide px-4 py-2 text-[13px] font-semibold tracking-wide text-bone"
          >
            + Clip
          </a>
        </nav>
      </header>

      <div className="mx-auto max-w-[1180px] px-8">
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
            });
            return (
              <div
                key={tag.tag_id}
                className="w-[168px] flex-none rounded-lg border border-white/10 bg-ink-2 p-4"
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
              </div>
            );
          })}
        </div>
      </div>

      <HomeGrid clips={gridClips} filterTags={filterTags} />

      <div className="mx-auto max-w-[1180px] px-8">
        <footer className="border-t border-white/10 py-10">
          <p className="max-w-xl text-xs leading-relaxed text-bone/70">
            Sources: Behance, Dribbble, Instagram, agency sites, awards
            archives. Velocity is measured over a trailing 90 days — a tag
            reads Early Signal until its reference set is both deep enough
            and old enough to mean anything.
          </p>
        </footer>
      </div>
    </>
  );
}
