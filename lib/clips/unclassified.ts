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
// previously failed. This does NOT catch clips that already have tags
// from before a taxonomy change, or a clip with only incubating tags and
// no published one yet — see getClipsNeedingClassification, below, which
// is what the clipper UI actually uses.
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
// The one classification queue the clipper UI runs against. A clip needs
// classification for one of two distinct reasons, and the two need
// different classifiers — see scripts/clips-needing-classification.sql
// for the exact criteria:
//
//   mode 'full'       zero published clip_tags rows. Safe for the FULL
//                      classifier (classifyAndTagClip) — there's no
//                      existing published application to re-date.
//   mode 'incubating' already has a published tag, missing only some
//                      incubating/new-vocabulary tag. Must use
//                      classifyAndTagClipIncubatingOnly — the full
//                      classifier would write published applications
//                      timestamped now and swamp a board's trailing
//                      window.
//
// The row carries the mode; app/clip/classify-actions.ts only dispatches
// on it, never decides it.
// ---------------------------------------------------------------------

export type ClassificationQueueClip = UnclassifiedClip & {
  mode: "full" | "incubating";
};

export async function getClipsNeedingClassification(
  limit?: number
): Promise<ClassificationQueueClip[]> {
  const { data, error } = await supabaseAdmin.rpc(
    "clips_needing_classification",
    { row_limit: typeof limit === "number" ? limit : null }
  );
  if (error) {
    throw new Error(
      `Could not load clips needing classification: ${error.message}`
    );
  }
  return (data ?? []) as ClassificationQueueClip[];
}


// ---------------------------------------------------------------------
// Clips the classifier cannot read.
// ---------------------------------------------------------------------

export type ParkedClip = {
  id: string;
  url: string;
  image_url: string;
  title: string | null;
  reason: string;
  attempts: number;
  last_failed_at: string;
};

/**
 * Anthropic returns 400 "Unable to download the file" for a clip whose
 * image_url it cannot fetch — hotlink protection, a dead CDN, an expired
 * signed URL. That is a fact about the clip, not about the classifier,
 * and it will be true on every retry.
 *
 * Parking the clip takes it out of the queue so it stops blocking the
 * clips behind it and stops costing a request to rediscover. The row is
 * the worklist: fix the URL, delete the row, and it comes back.
 */
export async function parkClip(
  clipId: string,
  reason: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("park_clip", {
    p_clip_id: clipId,
    p_reason: reason.slice(0, 500),
  });
  if (error) {
    // Never let bookkeeping break a batch — the worst case is that the
    // clip is retried, which is what happened before this existed.
    console.error(`[park] could not park ${clipId}: ${error.message}`);
  }
}

export async function getParkedClips(limit?: number): Promise<ParkedClip[]> {
  const { data, error } = await supabaseAdmin.rpc("parked_clips", {
    row_limit: typeof limit === "number" ? limit : null,
  });
  if (error) {
    throw new Error(`Could not load parked clips: ${error.message}`);
  }
  return (data ?? []) as ParkedClip[];
}

// ---------------------------------------------------------------------
// The describe queue (search). Active clips with an image that aren't
// parked and have no search description yet. Newest first.
// ---------------------------------------------------------------------

export async function getClipsMissingDescriptions(
  limit?: number
): Promise<UnclassifiedClip[]> {
  const { data, error } = await supabaseAdmin.rpc("clips_missing_descriptions", {
    row_limit: typeof limit === "number" ? limit : null,
  });
  if (error) {
    throw new Error(`Could not load clips missing descriptions: ${error.message}`);
  }
  return (data ?? []) as UnclassifiedClip[];
}
