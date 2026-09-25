import { supabasePublic } from "@/lib/supabase/public";
import { RECENT_WINDOW_DAYS } from "@/lib/velocity";
import { getProfiles } from "@/lib/profiles/queries";
import { loaded, LIBRARY_UNAVAILABLE } from "@/lib/query-result";
import { onlyClassified } from "@/lib/clips/visibility";
import { SiteHeader } from "@/components/site-header";
import { CuratorCard, type CuratorCardData } from "@/components/curator-card";
import { HomeGrid, type GridClip } from "@/components/home-grid";
import { FollowButton } from "@/components/follow-button";
import { getFollowView } from "@/lib/follows";
import { getSessionCurator } from "@/lib/clip-session";

export const revalidate = 0;

export const metadata = {
  title: "Curators — 04AM",
  // Indexable: curator names were decided public on 2026-09-11.
};

// The panel, shown the way the Signals page shows the library (Daniela,
// 2026-09-25): a rail of curators, then their latest work, and almost no
// words.
//
// Following (same day): the grid is the work of the curators YOU follow.
// The rail puts them first under "Following", everyone else under
// "Suggested". Following nobody — or signed out — the rail is all
// "Suggested" and the grid waits, with one line saying why. Your own
// profile is never suggested to you. The instrument notes this page used to carry — drift, the gate,
// tag applications — are unchanged and still enforced on the feed
// (app/page.tsx, lib/curator-velocity.ts); they are just not explained here.

// One query for everyone's recent clips, grouped in JS: N+1 queries would
// scale with the panel, which is the thing this page exists to grow.
const STRIP = 3;
const POOL = 200;

type CompositionRow = { curator: string; base_count: number | string };
type StatsRow = { curator: string | null; total_clips: number | string };
type PoolClip = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  creator: string | null;
  rights_holder: string | null;
  clipped_by_name: string | null;
  clip_tags: { confidence: number | null; tags: { editorial_name: string } | null }[] | null;
};

export default async function CuratorsPage() {
  const [compRes, followView, me] = await Promise.all([
    supabasePublic.rpc("curator_composition", { window_days: RECENT_WINDOW_DAYS }),
    getFollowView(),
    getSessionCurator(),
  ]);
  const compLoad = loaded<CompositionRow>("curator_composition", compRes);
  // Most active first, as before: ordered by tag applications, all-time.
  const names = compLoad.rows
    .map((c) => ({ name: c.curator, base: Number(c.base_count) }))
    .sort((a, b) => b.base - a.base)
    .map((c) => c.name);
  const followed = new Set(followView.following);
  const followedNames = names.filter((n) => followed.has(n));

  const [statsResults, poolRes, profiles, feedRes] = await Promise.all([
    Promise.all(names.map((n) => supabasePublic.rpc("curator_clip_stats", { curator_name: n }).single())),
    names.length > 0
      ? supabasePublic
          .from("clips")
          .select(
            `id, url, image_url, title, source, creator, rights_holder, clipped_by_name,
             clip_tags ( confidence, tags ( editorial_name ) )`
          )
          .in("clipped_by_name", names)
          .is("archived_at", null)
          .not("image_url", "is", null)
          .order("clipped_at", { ascending: false })
          .limit(POOL)
      : Promise.resolve({ data: [] as PoolClip[], error: null }),
    getProfiles(names),
    // The grid: only the curators you follow, newest first.
    followedNames.length > 0
      ? supabasePublic
          .from("clips")
          .select(
            `id, url, image_url, title, source, creator, rights_holder, clipped_by_name,
             clip_tags ( confidence, tags ( editorial_name ) )`
          )
          .in("clipped_by_name", followedNames)
          .is("archived_at", null)
          .not("image_url", "is", null)
          .order("clipped_at", { ascending: false })
          .limit(POOL)
      : Promise.resolve({ data: [] as PoolClip[], error: null }),
  ]);

  const clipsByName = new Map<string, number>();
  for (const r of statsResults) {
    const row = r.data as unknown as StatsRow | null;
    if (row?.curator) clipsByName.set(row.curator, Number(row.total_clips));
  }

  // Public surfaces show classified clips only (Daniela, 2026-09-24).
  const pool = onlyClassified((poolRes.data ?? []) as unknown as PoolClip[], (c) => c.clip_tags);

  const strips = new Map<string, CuratorCardData["strip"]>();
  for (const c of pool) {
    if (!c.clipped_by_name) continue;
    const list = strips.get(c.clipped_by_name) ?? [];
    if (list.length < STRIP) list.push({ id: c.id, image_url: c.image_url, title: c.title });
    strips.set(c.clipped_by_name, list);
  }

  const roster: CuratorCardData[] = names.map((name) => ({
    name,
    displayName: profiles.get(name)?.display_name ?? null,
    clips: clipsByName.get(name) ?? null,
    strip: strips.get(name) ?? [],
  }));

  const feed = onlyClassified((feedRes.data ?? []) as unknown as PoolClip[], (c) => c.clip_tags);
  const grid: GridClip[] = feed.map((c) => ({
    id: c.id,
    url: c.url,
    image_url: c.image_url,
    title: c.title,
    source: c.creator ?? c.rights_holder ?? c.source,
    by: c.clipped_by_name,
    tags: (c.clip_tags ?? [])
      .filter((ct) => ct.tags !== null)
      .map((ct) => ({ editorial_name: ct.tags!.editorial_name, confidence: ct.confidence ?? 0 })),
  }));

  const card = (c: CuratorCardData) => (
    <CuratorCard
      key={c.name}
      curator={c}
      className="w-[260px] flex-none"
      follow={
        <FollowButton
          name={c.name}
          initialFollowing={followed.has(c.name)}
          signedIn={followView.signedIn}
          next="/curators"
        />
      }
    />
  );
  const following = roster.filter((c) => followed.has(c.name));
  const suggested = roster.filter((c) => !followed.has(c.name) && c.name !== me);

  return (
    <>
      <SiteHeader active="curators" />

      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-4 pt-6 sm:px-8 md:pt-10">
        <h1 className="sr-only">Curators</h1>
        {compLoad.failed ? (
          <p className="mb-10 text-sm text-bone/70">{LIBRARY_UNAVAILABLE}</p>
        ) : (
          <div className="mb-10 flex gap-8 overflow-x-auto pb-1.5">
            {following.length > 0 && (
              <Rail label="Following">{following.map(card)}</Rail>
            )}
            {suggested.length > 0 && (
              <Rail label="Suggested">{suggested.map(card)}</Rail>
            )}
          </div>
        )}
      </div>

      {following.length > 0 ? (
        <HomeGrid clips={grid} emptyText="Nothing from the curators you follow yet." />
      ) : (
        !compLoad.failed && (
          <p className="mx-auto w-full max-w-[1180px] px-4 pb-24 text-[13px] text-bone/55 sm:px-8">
            Follow a curator and their clips gather here.
          </p>
        )
      )}
    </>
  );
}

// One labelled run of cards inside the scrolling rail. The label rides
// with its cards, so "Suggested" starts exactly where "Following" ends.
function Rail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-none flex-col">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-bone/60">{label}</p>
      <div className="flex gap-3">{children}</div>
    </section>
  );
}
