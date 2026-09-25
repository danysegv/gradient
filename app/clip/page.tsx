import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getClipsMissingDescriptions,
  getClipsMissingColors,
  getClipsNeedingClassification,
} from "@/lib/clips/unclassified";
import { getSession } from "@/lib/clip-session";
import { getVisitorEmail } from "@/lib/supabase/auth-server";
import { NotACurator } from "./not-a-curator";
import { logoutFromClipper } from "./logout-actions";
import { ClipForm } from "./clip-form";
import { ProcessButton } from "./process-button";
import { ProfileEditor } from "./profile-editor";
import { getProfile } from "@/lib/profiles/queries";
import { ClipperGrid, type ClipperClip } from "@/components/clipper-grid";
import { ClipperInstall } from "@/components/clipper-install";
import { clipperRelease } from "@/lib/extension/release";
import { SiteHeader } from "@/components/site-header";

// Classification can process several clips sequentially in the
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
  const session = await getSession();
  // Defence in depth: proxy.ts gates this route too, but this page reads
  // through the service-role client (archived clips, parked URLs), so it
  // must never render for a request the proxy happened not to match.
  if (!session) {
    // Signed in, but the account hasn't been approved as a curator yet.
    const email = await getVisitorEmail();
    if (email) return <NotACurator email={email} />;
    redirect("/signin?next=/clip");
  }
  const curatorName = session.name;

  // Archived clips are fetched alongside the library so the Archived view
  // can restore them — soft-delete is only a safety net if there is a way
  // back that doesn't require SQL.
  //
  // Your clips only (Daniela, 2026-09-25): the grid and the Archived view
  // show what the signed-in curator clipped, nobody else's. The credit is
  // the current username — renaming rewrites clipped_by_name — so this is
  // the same name the session carries. Processing still covers the whole
  // library: it is one queue, and a clip is read whoever clipped it.
  const [
    { data: clips },
    { data: archivedClips },
    needsClassification,
    needsDescription,
    needsColors,
    profile,
  ] = await Promise.all([
    supabaseAdmin
      .from("clips")
      .select(CLIP_SELECT)
      .eq("clipped_by_name", curatorName)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(RECENT_CLIP_LIMIT),
    supabaseAdmin
      .from("clips")
      .select(CLIP_SELECT)
      .eq("clipped_by_name", curatorName)
      .not("archived_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(RECENT_CLIP_LIMIT),
    getClipsNeedingClassification(),
    getClipsMissingDescriptions(),
    getClipsMissingColors(),
    getProfile(curatorName),
  ]);

  const gridClips: ClipperClip[] = (clips ?? []).map(toGridClip);
  const archivedGridClips: ClipperClip[] = (archivedClips ?? []).map(toGridClip);
  // One queue for the button: a clip that needs three things is still one
  // clip to process, and the breakdown below the button says what each
  // call will actually be spent on.
  const needsWork = new Set([
    ...needsClassification.map((c) => c.id),
    ...needsDescription.map((c) => c.id),
  ]).size;
  const describedIds = new Set(needsDescription.map((c) => c.id));
  // Not work, and not billable: the pixel watcher reads these for free
  // within about fifteen minutes. Shown so a stalled watcher is visible.
  const awaitingColourReader = needsColors.filter((c) => !describedIds.has(c.id)).length;

  const KICKER = "text-xs font-semibold uppercase tracking-wide text-bone/70";

  return (
    <>
      <SiteHeader active="clip" />

      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-4 sm:px-8">
        {/* Head: the genome/radar pattern — an Oxide square kicker, one
            headline, and who is clipping on the right. */}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-10 pt-11">
          <div>
            <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
              <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
              Clipper
            </p>
            <h1 className="text-[34px] font-bold leading-tight tracking-tight">Clip a reference</h1>
          </div>
          {curatorName && (
            <div className="flex items-baseline gap-5">
              <p className={KICKER}>
                Clipping as <span className="text-bone">@{curatorName}</span>
              </p>
              <form action={logoutFromClipper}>
                <button type="submit" className={`${KICKER} underline underline-offset-4 hover:text-bone`}>
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>

        <ClipForm />

        {/* Your clips, and the one queue. Plain figures, never bold. */}
        <dl className="mt-16 grid gap-x-14 gap-y-6 border-y border-white/10 py-6 sm:grid-cols-2">
          {[
            { k: "Your clips", v: gridClips.length, note: `${archivedGridClips.length} archived` },
            { k: "To process", v: needsWork, note: needsWork === 0 ? "all read" : "across the library" },
          ].map(({ k, v, note }) => (
            <div key={k}>
              <dt className={`${KICKER} mb-1.5`}>{k}</dt>
              <dd className="flex items-baseline gap-3">
                <span className="text-[26px] font-normal leading-none tabular-nums">{v}</span>
                <span className="text-[12px] text-bone/50">{note}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-x-12 gap-y-10 py-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <ProcessButton
              totalCount={needsWork}
              classifyCount={needsClassification.length}
              describeCount={needsDescription.length}
              awaitingColourReader={awaitingColourReader}
            />
          </div>

          <div className="lg:col-span-5">
            <ClipperInstall version={clipperRelease.version} />
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-4 pb-24 pt-10 sm:px-6">
        <ClipperGrid initialClips={gridClips} initialArchived={archivedGridClips} />
      </div>

      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-4 pb-24 sm:px-8">
        <section className="border-t border-white/10 pt-8">
          <p className={`${KICKER} mb-5`}>Your profile</p>
          <ProfileEditor
            curator={curatorName}
            displayName={profile?.display_name ?? null}
            bio={profile?.bio ?? null}
            nameChangedAt={profile?.name_changed_at ?? null}
          />
        </section>
      </div>
    </>
  );
}
