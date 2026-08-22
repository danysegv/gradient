import { supabasePublic } from "@/lib/supabase/public";
import { getConfidence, type ConfidenceState } from "@/lib/confidence";
import { GradientMark } from "@/components/gradient-mark";
import { ClipThumbnail } from "@/components/clip-thumbnail";

// Always fetch fresh — this is a live feed, not a static marketing page.
export const revalidate = 0;

const TRENDING_TAG_LIMIT = 8;
const RECENT_CLIP_LIMIT = 24;
// Display-time filter for which tag chips show on a clip card — separate
// from the confidence-band reference count, which stays unfiltered (see
// lib/confidence.ts and the "filter at display time" decision). Tunable.
const CHIP_CONFIDENCE_THRESHOLD = 0.5;
const CHIPS_PER_CARD = 3;

type TrendingTag = {
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

function pickDisplayTags(clipTags: ClipTagRow[]): { editorial_name: string }[] {
  return clipTags
    .filter(
      (ct): ct is ClipTagRow & { tags: NonNullable<ClipTagRow["tags"]> } =>
        ct.tags !== null && (ct.confidence ?? 0) >= CHIP_CONFIDENCE_THRESHOLD
    )
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, CHIPS_PER_CARD)
    .map((ct) => ({ editorial_name: ct.tags.editorial_name }));
}

export default async function Home() {
  const [trendingRes, clipsRes, tagsInPlayRes, statsRes] = await Promise.all([
    supabasePublic
      .from("tag_clip_counts")
      .select(
        "tag_id, group, editorial_name, universal_term, clip_count, earliest_reference_at, latest_reference_at"
      )
      .gt("clip_count", 0)
      .order("clip_count", { ascending: false })
      .limit(TRENDING_TAG_LIMIT),
    supabasePublic
      .from("clips")
      .select(
        `id, url, image_url, title, source, clipped_at,
         clip_tags ( confidence, tags ( editorial_name, group ) )`
      )
      .order("clipped_at", { ascending: false })
      .limit(RECENT_CLIP_LIMIT),
    supabasePublic
      .from("tag_clip_counts")
      .select("tag_id", { count: "exact", head: true })
      .gt("clip_count", 0),
    supabasePublic.from("clips").select("id, clip_tags ( clip_id )"),
  ]);

  const trendingTags = (trendingRes.data ?? []) as unknown as TrendingTag[];
  const clips = (clipsRes.data ?? []) as unknown as ClipRow[];
  const tagsInPlay = tagsInPlayRes.count ?? 0;
  const statsRows = (statsRes.data ?? []) as unknown as StatsRow[];
  const totalClips = statsRows.length;
  const classifiedClips = statsRows.filter(
    (c) => (c.clip_tags?.length ?? 0) > 0
  ).length;

  return (
    <>
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-7">
        <GradientMark className="h-[22px] text-bone" />
        <nav className="flex items-center gap-7">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone">
            Signals
          </span>
          {/* Radar and Genome are locked V1 scope but not built yet —
              inert placeholders rather than links to routes that 404. */}
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone/35">
            Radar
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone/35">
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

      <div className="mx-auto max-w-[1180px] px-8 pb-24">
        <div className="pt-11 pb-2">
          <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-oxide">
            Signals Feed — live from the library
          </p>
          <h1 className="mb-2.5 text-[34px] font-bold leading-tight tracking-tight">
            What&rsquo;s actually moving
          </h1>
          <p className="mb-9 max-w-xl text-[15px] leading-relaxed text-bone/60">
            Pulled straight from Supabase, not a mockup dataset — {classifiedClips}{" "}
            of {totalClips} clips classified, {tagsInPlay} tags in play, real
            thumbnails from the actual sources you clipped.
          </p>
        </div>

        <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/45">
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
                <p className="mb-3.5 text-xs text-bone/45">
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

        <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/45">
          Recent clips
        </p>
        <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip) => {
            const chips = pickDisplayTags(clip.clip_tags ?? []);
            return (
              <a
                key={clip.id}
                href={clip.url}
                target="_blank"
                rel="noreferrer"
                className="group relative block aspect-[4/5] overflow-hidden rounded-lg border border-white/10 bg-ink-2"
              >
                <ClipThumbnail
                  imageUrl={clip.image_url}
                  title={clip.title}
                  source={clip.source}
                />
                {clip.source && (
                  <span
                    className="absolute bottom-2.5 left-3 text-[11px] font-semibold opacity-85 transition-opacity group-hover:opacity-0"
                    style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
                  >
                    {clip.source}
                  </span>
                )}
                <div
                  className="pointer-events-none absolute inset-0 flex flex-col justify-end p-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(11,10,14,0.92) 0%, rgba(11,10,14,0.55) 45%, rgba(11,10,14,0) 75%)",
                  }}
                >
                  <p className="mb-0.5 text-sm font-semibold leading-snug">
                    {clip.title || clip.url}
                  </p>
                  {clip.source && (
                    <p className="mb-2.5 text-xs text-bone/55">
                      {clip.source}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map((chip, i) => (
                      <span
                        key={chip.editorial_name}
                        className={`rounded px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          i === 0 ? "bg-oxide" : "bg-white/[.12]"
                        }`}
                      >
                        {chip.editorial_name}
                      </span>
                    ))}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      <footer className="border-t border-white/10 px-8 py-10">
        <p className="max-w-xl text-xs leading-relaxed text-bone/40">
          Personally curated, not user-generated or scraped — every reference
          here was clipped by hand from Behance, Dribbble, agency sites, and
          awards archives, then classified against a locked taxonomy.
        </p>
      </footer>
    </>
  );
}
