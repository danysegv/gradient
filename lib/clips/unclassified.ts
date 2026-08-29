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
//
// 2026-08-28: the anti-join moved into Postgres (unclassified_clips RPC).
// This used to fetch EVERY clip_tags row to build a Set of tagged ids and
// subtract it from every candidate clip in JavaScript. Two unbounded
// queries, and past PostgREST's max-rows cap the tagged Set would have
// come back incomplete — which reports already-classified clips as
// unclassified and re-sends them to the Claude API. Wrong data and real
// spend, silently. NOT EXISTS also short-circuits on the first match
// rather than materialising the whole join.
export async function getUnclassifiedClips(
  limit?: number
): Promise<UnclassifiedClip[]> {
  const { data, error } = await supabaseAdmin.rpc("unclassified_clips", {
    row_limit: typeof limit === "number" ? limit : null,
  });
  if (error) {
    throw new Error(`Could not load unclassified clips: ${error.message}`);
  }
  // image_url is NOT NULL by the RPC's own WHERE clause; the cast records
  // that rather than re-filtering for it here.
  return (data ?? []) as UnclassifiedClip[];
}
