import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUnclassifiedClips } from "@/lib/clips/unclassified";
import { ClipForm } from "./clip-form";
import { ReclassifyButton } from "./reclassify-button";

// Reclassification can process several clips sequentially in the
// background (after()) — give the route more room than the default.
export const maxDuration = 300;

export default async function ClipPage() {
  const { data: clips } = await supabaseAdmin
    .from("clips")
    .select("id, url, image_url, title, source, caption, clipped_at, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const unclassified = await getUnclassifiedClips();

  return (
    <main className="flex flex-col gap-10 p-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-lg mb-4">Clipper</h1>
        <ClipForm />
      </div>

      <div>
        <h2 className="text-sm mb-2">Recent clips</h2>
        {clips && clips.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {clips.map((clip) => (
              <li key={clip.id} className="text-sm border-b pb-2">
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
                {!clip.image_url && (
                  <span className="text-amber-600"> · needs image</span>
                )}
              </li>
            ))}
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
