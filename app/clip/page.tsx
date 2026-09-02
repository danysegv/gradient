import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUnclassifiedClips } from "@/lib/clips/unclassified";
import { CLIP_SESSION_COOKIE, sessionCurator } from "@/lib/clip-auth";
import { ClipForm } from "./clip-form";
import { ReclassifyButton } from "./reclassify-button";
import { ClipperGrid, type ClipperClip } from "@/components/clipper-grid";

// Reclassification can process several clips sequentially in the
// background (after()) — give the route more room than the default.
export const maxDuration = 300;

// Not real pagination — a ceiling well above the current library size (73
// as of 2026-08-21) so the clipper always shows everything. Revisit (real
// pagination/infinite scroll) once the library outgrows this.
const RECENT_CLIP_LIMIT = 500;

// Path-extension heuristic only — some CDNs put the real format in a
// query param instead of the path, so this can false-positive on those.
// Good enough for spotting an accidentally-pasted page URL. Also flags
// image_url === url outright: several source sites (Instagram, Behance's
// module deep-links, Fonts in Use's zoom-lightbox anchors) don't expose a
// plain right-click-able direct image file, so the page URL ends up
// pasted into both fields — confirmed the cause for 3 of the first 9
// flagged clips.
const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|gif|webp)$/i;

function looksLikeImageUrl(imageUrl: string, pageUrl: string): boolean {
  if (imageUrl === pageUrl) return false;
  try {
    return IMAGE_EXTENSION_PATTERN.test(new URL(imageUrl).pathname);
  } catch {
    return false;
  }
}

// The actual runtime shape (verified against a live query): `tags` is a
// single object, since clip_tags.tag_id -> tags.id is a to-one FK.
// Without generated Database types, supabase-js's inferred TS type for
// this embed is wrong (it guesses array) — cast to this at the call site
// rather than trust the inference.
type ClipTagRow = {
  confidence: number;
  tags: { group: string; editorial_name: string; universal_term: string } | null;
};

function groupTagsByAxis(clipTags: ClipTagRow[]) {
  const byAxis = new Map<
    string,
    { editorial_name: string; confidence: number }[]
  >();
  for (const ct of clipTags) {
    if (!ct.tags) continue;
    const list = byAxis.get(ct.tags.group) ?? [];
    list.push({
      editorial_name: ct.tags.editorial_name,
      confidence: ct.confidence,
    });
    byAxis.set(ct.tags.group, list);
  }
  for (const list of byAxis.values()) {
    list.sort((a, b) => b.confidence - a.confidence);
  }
  return byAxis;
}

const CLIP_SELECT = `id, url, image_url, title, source, creator, rights_holder, found_via, source_year, caption, clipped_at, created_at, clipped_by_name,
       clip_tags ( confidence, tags ( group, editorial_name, universal_term ) )`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGridClip(clip: any): ClipperClip {
  const axisMap = groupTagsByAxis(
    (clip.clip_tags ?? []) as unknown as ClipTagRow[]
  );
  return {
    id: clip.id,
    url: clip.url,
    image_url: clip.image_url,
    title: clip.title,
    // Clips made before 2026-08-29 have a free-text `source` and no
    // structured attribution; clips made after have the reverse. Show the
    // best credit available, preferring the maker, and fall back to the
    // legacy field so both eras render.
    source:
      clip.creator ??
      clip.rights_holder ??
      clip.source ??
      (clip.found_via ? `via ${clip.found_via}` : null),
    clipped_at: clip.clipped_at,
    clippedByName: clip.clipped_by_name,
    needsImage: !clip.image_url,
    badImageUrl:
      !!clip.image_url && !looksLikeImageUrl(clip.image_url, clip.url),
    tagsByAxis: Array.from(axisMap.entries()).map(([group, tags]) => ({
      group,
      tags,
    })),
  };
}

export default async function ClipPage() {
  const cookieStore = await cookies();
  const curatorName = sessionCurator(
    cookieStore.get(CLIP_SESSION_COOKIE)?.value
  );

  // Archived clips are fetched alongside the library so the Archived view
  // can restore them — soft-delete is only a safety net if there is a way
  // back that doesn't require SQL.
  const [{ data: clips }, { data: archivedClips }, unclassified] =
    await Promise.all([
      supabaseAdmin
        .from("clips")
        .select(CLIP_SELECT)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(RECENT_CLIP_LIMIT),
      supabaseAdmin
        .from("clips")
        .select(CLIP_SELECT)
        .not("archived_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(RECENT_CLIP_LIMIT),
      getUnclassifiedClips(),
    ]);

  const gridClips: ClipperClip[] = (clips ?? []).map(toGridClip);
  const archivedGridClips: ClipperClip[] = (archivedClips ?? []).map(toGridClip);

  return (
    <>
      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8 py-10">
        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold">Clipper</h1>
          {curatorName && (
            <p className="text-xs font-semibold uppercase tracking-wide text-bone/70">
              Clipping as {curatorName}
            </p>
          )}
        </div>
        <ClipForm />
        <div className="mt-8">
          <ReclassifyButton eligibleCount={unclassified.length} />
        </div>
      </div>

      <div className="px-4 pb-24">
        <ClipperGrid
          initialClips={gridClips}
          initialArchived={archivedGridClips}
        />
      </div>
    </>
  );
}
