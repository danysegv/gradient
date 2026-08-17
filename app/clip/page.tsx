import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUnclassifiedClips } from "@/lib/clips/unclassified";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ClipForm } from "./clip-form";
import { ReclassifyButton } from "./reclassify-button";

// Reclassification can process several clips sequentially in the
// background (after()) — give the route more room than the default.
export const maxDuration = 300;

// Display order matches gradient-taxonomy.md's section headings.
// format_motion is included even though the classifier skips it — those
// tags are applied by hand, and their clips still deserve to render.
const AXES: { key: string; label: string }[] = [
  { key: "movement", label: "Movements" },
  { key: "typography", label: "Typography" },
  { key: "palette_light", label: "Palette & Light" },
  { key: "layout", label: "Layout" },
  { key: "format_motion", label: "Format & Motion" },
  { key: "treatment", label: "Treatment" },
];

// Path-extension heuristic only — some CDNs put the real format in a
// query param instead of the path, so this can false-positive on those.
// Good enough for spotting an accidentally-pasted page URL.
const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|gif|webp)$/i;

function looksLikeImageUrl(url: string): boolean {
  try {
    return IMAGE_EXTENSION_PATTERN.test(new URL(url).pathname);
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
    { editorial_name: string; universal_term: string; confidence: number }[]
  >();
  for (const ct of clipTags) {
    if (!ct.tags) continue;
    const list = byAxis.get(ct.tags.group) ?? [];
    list.push({
      editorial_name: ct.tags.editorial_name,
      universal_term: ct.tags.universal_term,
      confidence: ct.confidence,
    });
    byAxis.set(ct.tags.group, list);
  }
  for (const list of byAxis.values()) {
    list.sort((a, b) => b.confidence - a.confidence);
  }
  return byAxis;
}

export default async function ClipPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/clip-login");
  }

  const { data: clips } = await supabase
    .from("clips")
    .select(
      `id, url, image_url, title, source, caption, clipped_at, created_at, clipped_by,
       clip_tags ( confidence, tags ( group, editorial_name, universal_term ) )`
    )
    .order("created_at", { ascending: false })
    .limit(20);

  const unclassified = await getUnclassifiedClips();
  const clippedByIds = [
    ...new Set(
      (clips ?? [])
        .map((clip) => clip.clipped_by)
        .filter((id): id is string => typeof id === "string")
    ),
  ];
  const clippers = await Promise.all(
    clippedByIds.map(async (id) => {
      const {
        data: { user: clipper },
      } = await supabaseAdmin.auth.admin.getUserById(id);
      return [id, clipper?.email ?? "Unknown user"] as const;
    })
  );
  const clipperEmailById = new Map(clippers);

  return (
    <main className="flex flex-col gap-10 p-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-lg mb-4">Clipper</h1>
        <ClipForm />
      </div>

      <div>
        <h2 className="text-sm mb-2">Recent clips</h2>
        {clips && clips.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {clips.map((clip) => {
              const axisMap = groupTagsByAxis(
                (clip.clip_tags ?? []) as unknown as ClipTagRow[]
              );
              const badImageUrl =
                !!clip.image_url && !looksLikeImageUrl(clip.image_url);

              return (
                <li key={clip.id} className="flex gap-3 text-sm border-b pb-3">
                  {clip.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary external hosts, not worth an Image remotePatterns allowlist for a private thumbnail
                    <img
                      src={clip.image_url}
                      alt=""
                      loading="lazy"
                      className="w-16 h-16 shrink-0 rounded border object-cover bg-black/5"
                    />
                  ) : (
                    <div className="w-16 h-16 shrink-0 rounded border bg-black/5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div>
                      <a
                        href={clip.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {clip.title || clip.url}
                      </a>
                      {clip.source && (
                        <span className="opacity-70"> — {clip.source}</span>
                      )}
                      <span className="opacity-70">
                        {" "}· clipped by{" "}
                        {clip.clipped_by
                          ? (clipperEmailById.get(clip.clipped_by) ?? "Unknown user")
                          : "Unknown user"}
                      </span>
                      {!clip.image_url && (
                        <span className="text-amber-600"> · needs image</span>
                      )}
                      {badImageUrl && (
                        <span className="text-amber-600">
                          {" "}
                          · image_url looks wrong
                        </span>
                      )}
                    </div>
                    {axisMap.size > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {AXES.filter((axis) => axisMap.has(axis.key)).map(
                          (axis) => (
                            <li key={axis.key} className="text-xs opacity-80">
                              <span className="opacity-60">
                                {axis.label}:
                              </span>{" "}
                              {axisMap
                                .get(axis.key)!
                                .map(
                                  (t) =>
                                    `${t.editorial_name} (${Math.round(t.confidence * 100)}%)`
                                )
                                .join(", ")}
                            </li>
                          )
                        )}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm opacity-70">No clips yet.</p>
        )}
      </div>

      <div>
        <h2 className="text-sm mb-2">Classification</h2>
        <ReclassifyButton eligibleCount={unclassified.length} />
      </div>
    </main>
  );
}
