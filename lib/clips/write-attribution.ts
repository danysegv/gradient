import "server-only";
import { supabaseAdmin } from "../supabase/admin.ts";
import {
  foundViaFromUrl,
  attributionPatch,
  type AttributionFields,
} from "./attribution.ts";
import type { Attribution } from "../claude/attribution-extract.ts";

/**
 * Writes inferred attribution into a clip, and ONLY into fields that are
 * still empty.
 *
 * A human typing a credit always wins over a model inferring one — this
 * never overwrites, it only fills blanks. attribution_parsed_at is
 * stamped so an inference stays distinguishable from something entered by
 * hand, which is the entire reason that column exists.
 *
 * found_via is not inferred at all: it comes from the URL host, which is
 * a fact about the clip rather than a judgement about the work.
 */
export async function fillEmptyAttribution(
  clipId: string,
  url: string,
  attribution: Attribution
): Promise<void> {
  const { data: current, error: readError } = await supabaseAdmin
    .from("clips")
    .select("creator, rights_holder, found_via, source_year")
    .eq("id", clipId)
    .single();

  if (readError || !current) return;

  // The never-overwrite rule lives in one tested place, not inline here.
  const patch = attributionPatch(current as AttributionFields, {
    creator: attribution.creator,
    rights_holder: attribution.rightsHolder,
    source_year: attribution.sourceYear,
    found_via: foundViaFromUrl(url),
  });

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabaseAdmin
    .from("clips")
    .update({ ...patch, attribution_parsed_at: new Date().toISOString() })
    .eq("id", clipId);

  if (error) {
    // Attribution is additive metadata — a failure here must never lose
    // the clip or its tags, which are the things that actually matter.
    console.error(
      `[attribution] write failed for ${clipId}: ${error.message}`
    );
  }
}
