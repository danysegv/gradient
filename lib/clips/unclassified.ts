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
// tags from before a taxonomy change — that mode is
// getClipsMissingIncubatingTags, below.
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


// ---------------------------------------------------------------------
// The incubating-vocabulary backfill queue.
//
// getUnclassifiedClips only returns clips with ZERO tags, so every
// already-classified clip is invisible to it and would never receive the
// new vocabulary. This is the other mode: clips that carry no incubating
// tag yet, whether or not they are otherwise classified.
// ---------------------------------------------------------------------

export async function getClipsMissingIncubatingTags(
  limit?: number
): Promise<UnclassifiedClip[]> {
  const { data, error } = await supabaseAdmin.rpc(
    "clips_missing_incubating_tags",
    { row_limit: typeof limit === "number" ? limit : null }
  );
  if (error) {
    throw new Error(
      `Could not load clips missing incubating tags: ${error.message}`
    );
  }
  return (data ?? []) as UnclassifiedClip[];
}
