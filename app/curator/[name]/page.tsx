import { BOARD } from "@/lib/boards/naming";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabasePublic } from "@/lib/supabase/public";
import { getConfidence } from "@/lib/confidence";
import { fetchFrozenAxes } from "@/lib/taxonomy-freeze";
import { confidenceNoteText } from "@/lib/confidence-display";
import { velocityFromCounts, RECENT_WINDOW_DAYS } from "@/lib/velocity";
import { MIN_CURATOR_BASE_VOLUME } from "@/lib/curator-velocity";
import { AXES, AXIS_LABEL } from "@/lib/axes";
import { HomeGrid, type GridClip } from "@/components/home-grid";
import { BoardCard } from "@/components/boards/board-card";
import { NewBoard } from "@/components/boards/new-board";
import { getSessionCurator } from "@/lib/clip-session";
import { boardHref, listBoards, searchBoards } from "@/lib/boards/queries";
import { SearchSummary } from "@/components/search-summary";
import { normaliseQuery } from "@/lib/search/query";
import { fetchGridClips, searchClipIds } from "@/lib/search/results";
import { getProfile, currentNameForOldName } from "@/lib/profiles/queries";
import { SiteHeader } from "@/components/site-header";

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
  let who =
    (data as unknown as { curator: string | null } | null)?.curator ?? null;
  if (!who) {
    // A profile with boards but no clips yet still has a page.
    const { data: profile } = await supabasePublic
      .from("profiles")
      .select("name")
      .eq("name", decodeURIComponent(name).toLowerCase())
      .maybeSingle();
    who = (profile as { name: string } | null)?.name ?? null;
  }
  // No match means this request is about to 404 — do not title the tab
  // with the string the visitor mistyped.
  return {
    title: who ? `${who} — 04AM` : "Not found — 04AM",
    // Indexable: curator names were decided public on 2026-09-11.
  };
}

const TAG_RAIL_LIMIT = 8;
// The signature list is a spectrum, not a top-N: the tags a curator pulls
// hardest toward and the ones they pull hardest away from, in one ranked
// run. Both ends matter — "never touches AnalogNoise" is as much a
// portrait as "clips nothing but BoldGrotesk."
const SIGNATURE_TOWARD = 5;
const SIGNATURE_AWAY = 3;
const CLIP_LIMIT = 200;
// Attention's track: the midpoint is an even split across the axes, the
// end of the track is this many times that. 2.5 keeps a typical profile
// around half a bar and leaves room for a genuinely one-eyed curator.
const ATTENTION_EVEN_SPAN = 2.5;

// clip_tags is a true to-many relation; its nested `tags` is a single
// object at runtime despite supabase-js inferring an array without
// generated Database types. Same gotcha and same fix as app/page.tsx.
// PostgREST serialises bigint as a JSON string — every count out of these
// RPCs is coerced with Number() at the boundary. Left alone it would
// poison the arithmetic silently rather than throwing.
type AxisAttentionRow = {
  group: string;
  curator_readings: number | string;
  library_readings: number | string;
};

type RawTagRow = {
  tag_id: string;
  group: string;
  editorial_name: string;
  universal_term: string;
  clip_count: number | string;
  recent_count: number | string;
  earliest_reference_at: string | null;
  latest_reference_at: string | null;
  is_published: boolean;
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
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { name } = await params;
  const q = normaliseQuery((await searchParams).q);
  const requested = decodeURIComponent(name);

  // Resolve the URL segment to a canonical stored name. The match is
  // case-insensitive but done with = on lower() inside the RPC, never
  // LIKE/ilike: the segment comes from a URL and % / _ are wildcards
  // there, so an ilike would let /curator/%25 match every curator at once.
  // An unknown name comes back with a null curator, which is the 404.
  const statsRes = await supabasePublic
    .rpc("curator_clip_stats", { curator_name: requested })
    .single();
  // .single() reports "no rows" as an error (PGRST116). THAT one is data —
  // it means this name has clipped nothing yet, and the branch below is
  // built for it. Every other error is the database failing, and it must
  // not be allowed to fall through to notFound(): a 404 asserts that this
  // curator does not exist. That is a claim about a person, it is the claim
  // a search engine remembers, and during the 2026-09-12 outage every
  // curator page would have made it.
  if (statsRes.error && statsRes.error.code !== "PGRST116") {
    throw new Error(
      `curator_clip_stats(${requested}) failed: ${statsRes.error.message}`
    );
  }
  const stats = statsRes.data as unknown as CuratorStatsRow | null;
  const viewer = await getSessionCurator();

  let curator: string;
  if (stats?.curator) {
    curator = stats.curator;
  } else {
    // No clips yet. The page exists for its owner, who needs somewhere to
    // make boards before their first clip, and for visitors once the
    // profile has a public board. Otherwise it 404s as before — a name
    // with nothing to show leaves no ghost page.
    const profileRes = await supabasePublic
      .from("profiles")
      .select("name")
      .eq("name", requested.toLowerCase())
      .maybeSingle();
    // Same rule: maybeSingle() returns null data for "no such row", and an
    // error only when the read itself failed. Only the first is a 404.
    if (profileRes.error) {
      throw new Error(
        `profiles(${requested}) failed: ${profileRes.error.message}`
      );
    }
    const profileName = (profileRes.data as { name: string } | null)?.name;
    if (!profileName) {
      // A username this person used to hold: send the link to where they
      // are now rather than 404ing something that was shared in good faith.
      const moved = await currentNameForOldName(requested);
      if (moved) redirect(`/curator/${encodeURIComponent(moved)}`);
      notFound();
    }
    curator = profileName;
    if (viewer !== curator && (await listBoards(curator, false)).length === 0) {
      notFound();
    }
  }
  const isOwner = viewer === curator;

  // Searching this profile: their clips and their boards only.
  const searchPromise = q
    ? Promise.all([
        searchClipIds(q),
        searchBoards(q, { viewer, scopeOwner: curator }),
      ]).then(async ([clipSearch, boardHits]) => ({
        clips: await fetchGridClips(clipSearch.ids, { curator }),
        exact: clipSearch.exact,
        boards: boardHits,
      }))
    : Promise.resolve(null);

  const [clipsRes, tagCountsRes, libraryCountsRes, axisRes, frozenAxes, boards, search, profile] =
    await Promise.all([
    // The only row-level query on this page, and deliberately capped —
    // CLIP_LIMIT is display pagination, not an accident.
    supabasePublic
      .from("clips")
      .select(
        `id, url, image_url, title, source, clipped_at,
         clip_tags ( confidence,
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
    // ATTENTION's own counts: one row per axis, readings at confidence
    // >= 0.5 — the same bar a trait has to clear everywhere else on the
    // site — for this curator and for the library. Published tags only.
    supabasePublic.rpc("curator_axis_attention", { curator_name: curator }),
    // Which axes are mid-expansion. Empty until the 37 frozen tags land.
    fetchFrozenAxes(supabasePublic),
    // Private boards are read only when the signed-in curator is this one.
    listBoards(curator, isOwner),
    searchPromise,
    getProfile(curator)
  ]);

  const clips = (clipsRes.data ?? []) as unknown as ClipRow[];

  const tagStats = ((tagCountsRes.data ?? []) as unknown as RawTagRow[])
    .map((t) => ({
      ...t,
      clip_count: Number(t.clip_count),
      recent_count: Number(t.recent_count),
    }))
    .filter((t) => t.clip_count > 0);

  // Their own denominators — this page compares a person against
  // themselves, so the totals are theirs, not the library's. Published
  // only, for the same reason the homepage sums published rows: an
  // incubating tag is not part of the vocabulary these shares are OF.
  const theirPublished = tagStats.filter((t) => t.is_published);
  const theirBaseRefs = theirPublished.reduce((n, t) => n + t.clip_count, 0);
  const theirRecentRefs = theirPublished.reduce(
    (n, t) => n + t.recent_count,
    0
  );

  const velocities = new Map<string, number | null>(
    theirPublished.map((t) => [
      t.tag_id,
      velocityFromCounts({
        baseRefs: t.clip_count,
        recentRefs: t.recent_count,
        baseTotalRefs: theirBaseRefs,
        recentTotalRefs: theirRecentRefs,
      }),
    ])
  );

  // The Signature block compares shares against the library, so its
  // denominator is published-only too.
  const libraryTags = ((libraryCountsRes.data ?? []) as unknown as RawTagRow[])
    .map((t) => ({ ...t, clip_count: Number(t.clip_count) }))
    .filter((t) => t.clip_count > 0 && t.is_published);
  const libraryApplications = libraryTags.reduce((n, t) => n + t.clip_count, 0);

  // SIGNATURE — how this curator's attention is distributed compared with
  // the library's. Ranking a curator's tags by their own raw count mostly
  // reproduces the library's biggest tags, because a big tag is big for
  // everyone; the difference of shares is what is actually theirs. Same
  // base-rate correction the Genome audit applied to co-occurrence on
  // 2026-09-02, and the same reason computeBalancedVelocities iterates
  // every tag in the library rather than only the ones a curator touched:
  // dropping a tag entirely is a real signal, and skipping the untouched
  // ones would bias the list toward whatever they happen to use.
  const theirCountByTag = new Map(tagStats.map((t) => [t.tag_id, t.clip_count]));
  const leans =
    theirBaseRefs === 0 || libraryApplications === 0
      ? []
      : libraryTags
          .map((t) => ({
            tag_id: t.tag_id,
            editorial_name: t.editorial_name,
            lean:
              (theirCountByTag.get(t.tag_id) ?? 0) / theirBaseRefs -
              t.clip_count / libraryApplications,
          }))
          .sort((a, b) => b.lean - a.lean);
  const signature =
    leans.length <= SIGNATURE_TOWARD + SIGNATURE_AWAY
      ? leans
      : [...leans.slice(0, SIGNATURE_TOWARD), ...leans.slice(-SIGNATURE_AWAY)];
  const maxLean = signature.reduce((m, t) => Math.max(m, Math.abs(t.lean)), 0);
  // Withheld under the same floor a curator's own velocity uses: below ~30
  // tag-applications a single clip moves a share by more than 3 points and
  // the "signature" would be describing one afternoon.
  const showSignature =
    signature.length > 0 && theirBaseRefs >= MIN_CURATOR_BASE_VOLUME;


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

  // ATTENTION — how their reading splits across the axes, against how
  // the library's splits. Two things used to make every profile look the
  // same here. It counted every clip_tags row, including the 0.2-
  // confidence guesses nothing else on the site treats as a trait, so
  // the axis with the most tags in the vocabulary always won. And each
  // bar was drawn as a share of the biggest axis, so the top row was a
  // full bar on every profile by construction. Now a reading has to
  // clear 0.5, and the track is a fixed scale — the midpoint is
  // ATTENTION_EVEN_SPAN times an even split across the axes — so a full
  // bar means genuinely lopsided attention and is rare. The slate tick
  // is the library on that axis: the bar says what they look at, the
  // distance from the tick says how that differs from everyone.
  const axisRows = (axisRes.data ?? []) as unknown as AxisAttentionRow[];
  const axisByKey = new Map(
    axisRows.map((r) => [
      r.group,
      { theirs: Number(r.curator_readings), library: Number(r.library_readings) },
    ])
  );
  const attention = AXES.map((a) => ({
    key: a.key,
    label: AXIS_LABEL[a.key] ?? a.key,
    count: axisByKey.get(a.key)?.theirs ?? 0,
    libraryCount: axisByKey.get(a.key)?.library ?? 0,
  })).filter((a) => a.libraryCount > 0);
  const axisTotal = attention.reduce((n, a) => n + a.count, 0);
  const axisLibraryTotal = attention.reduce((n, a) => n + a.libraryCount, 0);
  // An even split across the axes sits at 1 / attention.length; the track
  // runs to ATTENTION_EVEN_SPAN times that, so even attention draws every
  // bar at the same middling length and the shape is the difference.
  const axisScale =
    attention.length > 0 ? ATTENTION_EVEN_SPAN / attention.length : 1;
  const barPercent = (count: number, total: number) =>
    total === 0 ? 0 : Math.min(count / total / axisScale, 1) * 100;


  return (
    <>
      <SiteHeader active="curators" />

      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-4 sm:px-8">
        {/* Masthead, after a Dazed contributor page: the name at headline
            scale, the @username as a byline under it, then the bio. The
            username is the identity — every credit, every URL — so it is
            always shown, and it stands alone when no display name is set. */}
        <div className="border-b border-white/10 pb-10 pt-10 md:pt-14">
          <h1 className="text-[30px] font-bold leading-[1.05] tracking-tight md:text-[40px]">
            {profile?.display_name ?? curator}
          </h1>
          {profile?.display_name && (
            <p className="mt-2.5 text-[14px] text-bone/55">@{curator}</p>
          )}
          {profile?.bio && (
            <p className="mt-5 max-w-[46ch] whitespace-pre-line text-[15px] leading-relaxed text-bone/80">
              {profile.bio}
            </p>
          )}
        </div>

        <div className="mb-10">
          {/* No search box here: the header's search covers the library and
              a curator's own clips are searched from there. This only
              reports a ?q= that is already in the URL. */}
          {search && (
            <SearchSummary
              q={q}
              clipCount={search.clips.length}
              boardCount={search.boards.length}
              exact={search.exact}
              scope={`from ${curator}`}
            />
          )}
        </div>

        {search && search.boards.length > 0 && (
          <section className="mb-12">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-bone/70">
              {BOARD.Many}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
              {search.boards.map((b) => (
                <BoardCard key={b.id} href={boardHref(curator, b.slug)} board={b} />
              ))}
            </div>
          </section>
        )}

        {!search && (isOwner || boards.length > 0) && (
          <section className="mb-12">
            {isOwner && (
              <p className="mb-4 text-[11px] text-bone/60">
                Signed in as {curator}. Only you see private {BOARD.many}.
              </p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
              {boards.map((b) => (
                <BoardCard key={b.id} href={boardHref(curator, b.slug)} board={b} />
              ))}
              {isOwner && <NewBoard ownerName={curator} />}
            </div>
          </section>
        )}

        {/* The portrait: what they pull toward and away from, and where
            their attention sits. Two words of legend between them. */}
        <div className="mb-14 mt-12 grid gap-12 md:grid-cols-12">
          {showSignature && (
            <section className="md:col-span-7">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-bone/55">
                Signature
              </div>
              <div className="mb-3 flex items-baseline gap-4">
                <span className="w-[150px] flex-none" />
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
                  Less
                </span>
                <span className="flex-1 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-oxide">
                  More
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {signature.map((t) => {
                  const pts = t.lean * 100;
                  const width =
                    maxLean === 0 ? 0 : (Math.abs(t.lean) / maxLean) * 50;
                  return (
                    <div key={t.tag_id} className="flex items-center gap-4">
                      <Link
                        href={`/trend/${encodeURIComponent(t.editorial_name)}`}
                        className="w-[150px] flex-none truncate text-[11px] font-semibold uppercase tracking-wide hover:opacity-80"
                      >
                        {t.editorial_name}
                      </Link>
                      <div
                        className="relative h-[14px] min-w-[140px] flex-1 bg-white/[.06]"
                        title={`${pts >= 0 ? "+" : "\u2212"}${Math.abs(pts).toFixed(1)} points against the library`}
                      >
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-1/2 w-px bg-bone/40"
                        />
                        <span
                          aria-hidden
                          className={`absolute inset-y-0 ${
                            pts >= 0 ? "bg-oxide" : "bg-slate"
                          }`}
                          style={
                            pts >= 0
                              ? { left: "50%", width: `${width}%` }
                              : { right: "50%", width: `${width}%` }
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Attention: their tagging split across the axes. One word per
              row, one bar, no figures — the shape is the whole message. */}
          {attention.length > 0 && axisTotal > 0 && (
            <section className="md:col-span-4 md:col-start-9">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-bone/55">
                Attention
              </div>
              <div className="flex flex-col gap-2.5">
                {attention.map((a) => (
                  <div key={a.key} className="flex items-center gap-4">
                    <span className="w-[116px] flex-none truncate text-[11px] font-semibold uppercase tracking-wide text-bone/80">
                      {a.label}
                    </span>
                    <div
                      className="relative h-[14px] min-w-[60px] flex-1 bg-white/[.06]"
                      title={`${a.count} of ${axisTotal} readings here · the library: ${a.libraryCount} of ${axisLibraryTotal}`}
                    >
                      <span
                        aria-hidden
                        className="block h-full bg-bone/75"
                        style={{ width: `${barPercent(a.count, axisTotal)}%` }}
                      />
                      {/* the library on this axis, so a bar reads as more
                          or less than everyone rather than on its own */}
                      <span
                        aria-hidden
                        className="absolute top-0 h-full w-px bg-slate"
                        style={{ left: `${barPercent(a.libraryCount, axisLibraryTotal)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="mb-12 flex gap-3 overflow-x-auto pb-1.5">
          {tagStats.slice(0, TAG_RAIL_LIMIT).map((tag) => {
            const confidence = getConfidence({
              referenceCount: tag.clip_count,
              earliestReferenceAt: tag.earliest_reference_at,
              latestReferenceAt: tag.latest_reference_at,
              velocity: velocities.get(tag.tag_id) ?? null,
              coolingSuspended: frozenAxes.has(tag.group),
              isPublished: tag.is_published,
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
                <p className="mb-5 text-[15px] font-bold leading-tight">
                  {tag.editorial_name}
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

      <HomeGrid
        clips={search ? search.clips : gridClips}
        emptyText={null}
        layout="dealt"
      />

    </>
  );
}
