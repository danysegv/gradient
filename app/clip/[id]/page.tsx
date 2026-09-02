import Link from "next/link";
import { notFound } from "next/navigation";
import { supabasePublic } from "@/lib/supabase/public";
import { Wordmark } from "@/components/wordmark";
import { ClipThumbnail } from "@/components/clip-thumbnail";
import { TagName } from "@/components/tag-name";

// Live, like every other read surface in the product.
export const revalidate = 0;

// This route is a sibling of the clipper at /clip, not a child of it.
// There is no middleware in this project — /clip gates itself inside its
// own page component via lib/clip-auth — so nothing here inherits that
// password gate. If a middleware.ts is ever added, it must exclude
// /clip/<uuid> explicitly or this page disappears behind the gate.

const CHIP_CONFIDENCE_THRESHOLD = 0.5; // matches components/home-grid.tsx
const RELATED_LIMIT = 12;
// Deliberately under PostgREST's default 1000-row ceiling, which truncates
// silently rather than erroring (three bugs in this codebase have come from
// exactly that). At 400 tag-applications library-wide a scan filtered to one
// clip's tags returns low hundreds. Move this to an RPC before the library's
// total tag-applications approach 1000 — the arithmetic below is a join and
// a group-by that Postgres should be doing anyway.
const RELATED_SCAN_LIMIT = 1000;

const AXIS_ORDER = [
  "movement",
  "typography",
  "palette_light",
  "layout",
  "format_motion",
  "treatment",
];
const AXIS_LABEL: Record<string, string> = {
  movement: "Movement",
  typography: "Typography",
  palette_light: "Palette & Light",
  layout: "Layout",
  format_motion: "Format & Motion",
  treatment: "Treatment",
};

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type TagRow = {
  editorial_name: string;
  universal_term: string;
  description: string;
  group: string;
};

// clip_tags is a true to-many relation; its nested `tags` is a single
// object at runtime despite supabase-js inferring an array without
// generated Database types. Same gotcha and same fix as app/page.tsx.
type ClipTagRow = {
  tag_id: string;
  confidence: number | null;
  tags: TagRow | null;
};

type ClipRow = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  caption: string | null;
  clipped_at: string;
  clipped_by_name: string | null;
  creator: string | null;
  rights_holder: string | null;
  found_via: string | null;
  source_year: number | null;
  clip_tags: ClipTagRow[] | null;
};

type RelatedRow = {
  id: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
};

const CLIP_FIELDS = `id, url, image_url, title, source, caption, clipped_at,
   clipped_by_name, creator, rights_holder, found_via, source_year,
   clip_tags ( tag_id, confidence, tags ( editorial_name, universal_term, description, group ) )`;

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Not found — 04AM" };
  const { data } = await supabasePublic
    .from("clips")
    .select("title, source")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  const row = data as { title: string | null; source: string | null } | null;
  const name = row?.title || row?.source || "Clip";
  return {
    title: row ? `${name} — 04AM` : "Not found — 04AM",
    // Noindex for the same reason /curator/[name] and /trend/[name] are:
    // this page names the curator, and whether curator identity is public
    // before the membership model ships is still an open decision (and per
    // the 2026-08-25 note, partly Luma's). Flipping that decision makes all
    // three indexable at once — it is one line in each file, not a rebuild.
    robots: { index: false, follow: false },
  };
}

export default async function ClipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // PostgREST errors on a malformed uuid rather than returning empty, so
  // catch the shape here and 404 like any other missing record.
  if (!UUID.test(id)) notFound();

  const { data } = await supabasePublic
    .from("clips")
    .select(CLIP_FIELDS)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  const clip = data as unknown as ClipRow | null;
  // Archived clips 404 rather than 200 with a ghost record — the archive is
  // a removal, not a soft state the public can browse.
  if (!clip) notFound();

  const tags = (clip.clip_tags ?? [])
    .filter((ct) => ct.tags !== null)
    .map((ct) => ({ ...ct.tags!, confidence: ct.confidence ?? 0 }))
    .filter((t) => t.confidence >= CHIP_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence);

  const byAxis = AXIS_ORDER.map((axis) => ({
    axis,
    label: AXIS_LABEL[axis] ?? axis,
    tags: tags.filter((t) => t.group === axis),
  })).filter((a) => a.tags.length > 0);

  // "More like this" computed from the clip, not from the viewer — shared
  // tags only. The 2026-08-26 decision: recommendation from the object,
  // never from behaviour.
  const tagIds = (clip.clip_tags ?? []).map((ct) => ct.tag_id);
  let related: RelatedRow[] = [];
  if (tagIds.length > 0) {
    const { data: links } = await supabasePublic
      .from("clip_tags")
      .select("clip_id, tag_id")
      .in("tag_id", tagIds)
      .limit(RELATED_SCAN_LIMIT);

    const overlap = new Map<string, number>();
    for (const l of (links ?? []) as { clip_id: string }[]) {
      if (l.clip_id === clip.id) continue;
      overlap.set(l.clip_id, (overlap.get(l.clip_id) ?? 0) + 1);
    }
    const ranked = [...overlap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, RELATED_LIMIT)
      .map(([cid]) => cid);

    if (ranked.length > 0) {
      const { data: rc } = await supabasePublic
        .from("clips")
        .select("id, image_url, title, source")
        .in("id", ranked)
        .is("archived_at", null);
      const rank = new Map(ranked.map((cid, i) => [cid, i]));
      related = ((rc ?? []) as RelatedRow[]).sort(
        (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
      );
    }
  }

  const host = hostOf(clip.url);
  const hasCredit = Boolean(
    clip.creator || clip.rights_holder || clip.source_year || clip.found_via
  );

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

      <div className="mx-auto max-w-[1180px] px-8 pb-24">
        <div className="pt-7 pb-6">
          <Link
            href="/"
            className="text-[11px] font-semibold uppercase tracking-wide text-bone/70 hover:text-bone"
          >
            ← The Library
          </Link>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* The image is the subject, so it leads and it is not cropped. */}
          <div className="rounded-[3px] bg-ink-2 p-3">
            <ClipThumbnail
              imageUrl={clip.image_url}
              title={clip.title}
              source={clip.source}
              variant="detail"
            />
          </div>

          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight">
              {clip.title || clip.source || "Untitled"}
            </h1>

            {clip.caption && (
              <p className="mt-3 text-[14px] leading-relaxed text-bone/75">
                {clip.caption}
              </p>
            )}

            <a
              href={clip.url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-block rounded bg-oxide px-4 py-2.5 text-[13px] font-semibold tracking-wide text-bone"
            >
              View source ↗
            </a>
            {host && (
              <p className="mt-2 text-[11px] text-bone/70">{host}</p>
            )}

            <section className="mt-9 border-t border-white/10 pt-5">
              <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-wide text-bone/70">
                Credit
              </h2>
              {hasCredit ? (
                <dl className="flex flex-col gap-2.5">
                  {clip.creator && (
                    <div className="flex gap-3">
                      <dt className="w-[92px] flex-none text-[11px] uppercase tracking-wide text-bone/70">
                        Creator
                      </dt>
                      <dd className="text-[14px]">{clip.creator}</dd>
                    </div>
                  )}
                  {clip.rights_holder && (
                    <div className="flex gap-3">
                      <dt className="w-[92px] flex-none text-[11px] uppercase tracking-wide text-bone/70">
                        Rights
                      </dt>
                      <dd className="text-[14px]">{clip.rights_holder}</dd>
                    </div>
                  )}
                  {clip.source_year && (
                    <div className="flex gap-3">
                      <dt className="w-[92px] flex-none text-[11px] uppercase tracking-wide text-bone/70">
                        Year
                      </dt>
                      <dd className="text-[14px] font-normal">
                        {clip.source_year}
                      </dd>
                    </div>
                  )}
                  {clip.found_via && (
                    <div className="flex gap-3">
                      <dt className="w-[92px] flex-none text-[11px] uppercase tracking-wide text-bone/70">
                        Found via
                      </dt>
                      <dd className="text-[14px]">{clip.found_via}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                /* Honest rather than blank: 76 of the library's clips still
                   carry no creator or rights holder. Saying so is better
                   than an empty block that reads as "no credit exists." */
                <p className="text-[13px] leading-relaxed text-bone/70">
                  No credit recorded for this reference yet.
                </p>
              )}
            </section>

            <section className="mt-8 border-t border-white/10 pt-5">
              <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-wide text-bone/70">
                Clipped
              </h2>
              <p className="text-[14px]">
                {clip.clipped_by_name ? (
                  <Link
                    href={`/curator/${encodeURIComponent(clip.clipped_by_name)}`}
                    className="underline decoration-white/30 underline-offset-4 hover:decoration-bone"
                  >
                    {clip.clipped_by_name}
                  </Link>
                ) : (
                  <span className="text-bone/70">Unattributed</span>
                )}
              </p>
              <p className="mt-1 text-[11px] text-bone/70">
                {formatDate(clip.clipped_at)}
              </p>
            </section>
          </div>
        </div>

        {byAxis.length > 0 && (
          <section className="mt-14 border-t border-white/10 pt-7">
            <h2 className="mb-5 text-[11px] font-semibold uppercase tracking-wide text-bone/70">
              Traits
            </h2>
            <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
              {byAxis.map((axis) => (
                <div key={axis.axis}>
                  <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-bone/70">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 flex-none bg-oxide"
                    />
                    {axis.label}
                  </p>
                  <div className="flex flex-col gap-4">
                    {axis.tags.map((t) => (
                      <div key={t.editorial_name}>
                        <Link
                          href={`/trend/${encodeURIComponent(t.editorial_name)}`}
                          className="inline-block hover:opacity-80"
                        >
                          <TagName
                            editorial={t.editorial_name}
                            universal={t.universal_term}
                            size="lg"
                          />
                        </Link>
                        <p className="mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-bone/70">
                          {t.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-14 border-t border-white/10 pt-7">
            <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-bone/70">
              Shares traits with
            </h2>
            <p className="mb-5 max-w-xl text-xs leading-relaxed text-bone/70">
              Ranked by how many traits each reference has in common with this
              one — computed from the image, never from who is looking at it.
            </p>
            <div className="columns-2 gap-4 sm:columns-3 lg:columns-6">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/clip/${r.id}`}
                  className="mb-4 block break-inside-avoid overflow-hidden rounded-[3px] transition-transform duration-300 ease-out hover:scale-[1.02]"
                >
                  <ClipThumbnail
                    imageUrl={r.image_url}
                    title={r.title}
                    source={r.source}
                  />
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
