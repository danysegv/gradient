import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type UnclassifiedClip = {
  id: string;
  url: string;
  image_url: string;
  title: string | null;
  caption: string | null;
};

// Clips that have an image (so were eligible for classification) but
// carry zero clip_tags rows — never classified, or classification
// previously failed. Re-run reclassifyUnclassifiedClips whenever
// classification errors out; this does NOT catch clips that already have
// stale tags from before a taxonomy change — that's a different mode.
export async function getUnclassifiedClips(
  limit?: number
): Promise<UnclassifiedClip[]> {
  const { data: taggedRows, error: taggedError } = await supabaseAdmin
    .from("clip_tags")
    .select("clip_id");
  if (taggedError) {
    throw new Error(`Could not load tagged clips: ${taggedError.message}`);
  }
  const taggedIds = new Set((taggedRows ?? []).map((r) => r.clip_id));

  const { data: candidates, error: candidatesError } = await supabaseAdmin
    .from("clips")
    .select("id, url, image_url, title, caption")
    .not("image_url", "is", null)
    .order("clipped_at", { ascending: true });
  if (candidatesError) {
    throw new Error(`Could not load clips: ${candidatesError.message}`);
  }

  const eligible = (candidates ?? []).filter(
    (c): c is UnclassifiedClip => !!c.image_url && !taggedIds.has(c.id)
  );

  return typeof limit === "number" ? eligible.slice(0, limit) : eligible;
}
