import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  foundViaFromUrl,
  knownFinderNames,
  attributionPatch,
  type AttributionFields,
} from "@/lib/clips/attribution";

const CLASSIFIER_MODEL = "claude-opus-5";

// claude-opus-5 pricing: $5/$25 per MTok in/out; cache write (5-min,
// default ephemeral TTL) 1.25x input; cache read 0.1x input.
function logCost(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}) {
  const inputCost = (usage.input_tokens / 1_000_000) * 5;
  const outputCost = (usage.output_tokens / 1_000_000) * 25;
  const cacheWriteCost =
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * 6.25;
  const cacheReadCost =
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * 0.5;
  const total = inputCost + outputCost + cacheWriteCost + cacheReadCost;
  console.log(
    `[classify-clip] tokens: in=${usage.input_tokens} out=${usage.output_tokens} cache_write=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0} — est. cost $${total.toFixed(4)}`
  );
}

export type Classification = {
  tagId: string;
  tag: string;
  confidence: number;
};

// Extracted alongside the tags in the same vision call — no extra request,
// no extra image upload. See the attribution block in the system prompt
// for why every field here is biased hard toward null.
export type Attribution = {
  creator: string | null;
  rightsHolder: string | null;
  sourceYear: number | null;
};

export type ClipReading = {
  classifications: Classification[];
  attribution: Attribution;
};

// The AI classifier skips `format_motion` entirely in v1 (locked scope
// decision) — MotionLoop/StoryScroll are applied by hand at clip time.
export async function classifyClip(input: {
  url: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
}): Promise<ClipReading> {
  const { data: tags, error } = await supabaseAdmin
    .from("tags")
    .select("id, group, editorial_name, universal_term, description")
    .neq("group", "format_motion");

  if (error || !tags || tags.length === 0) {
    throw new Error(`Could not load taxonomy: ${error?.message ?? "no tags"}`);
  }

  const validNames = tags.map((t) => t.editorial_name) as [
    string,
    ...string[],
  ];
  const idByName = new Map(tags.map((t) => [t.editorial_name, t.id]));

  const ClassificationSchema = z.object({
    classifications: z.array(
      z.object({
        tag: z.enum(validNames),
        confidence: z.number(),
      })
    ),
    attribution: z.object({
      creator: z.string().nullable(),
      rights_holder: z.string().nullable(),
      source_year: z.number().nullable(),
    }),
  });

  const taxonomyDescription = tags
    .map(
      (t) =>
        `- ${t.editorial_name} (${t.group}, aka "${t.universal_term}"): ${t.description}`
    )
    .join("\n");

  const contextLines = [
    input.title ? `Title: ${input.title}` : null,
    input.caption ? `Caption: ${input.caption}` : null,
    `Source URL: ${input.url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await anthropic.messages.parse({
    model: CLASSIFIER_MODEL,
    max_tokens: 4096,
    output_config: {
      effort: "low",
      format: zodOutputFormat(ClassificationSchema),
    },
    system: [
      {
        type: "text",
        text: `You are classifying a design reference image against 04AM's taxonomy — a faceted system across five axes (movement, typography, palette_light, layout, treatment). A single image can carry a tag from every axis at once, or none from a given axis if nothing genuinely fits. For each axis, pick at most the single best-matching tag — never force a weak match. Rate your confidence in each tag from 0 to 1, calibrated to how clearly the image exhibits it.\n\nTaxonomy:\n${taxonomyDescription}\n\nSECOND TASK — ATTRIBUTION.\n\nAlso extract who made the work. Be conservative: null is the correct answer far more often than a guess, and a WRONG credit is worse than no credit. Crediting an aggregator for someone else's work is the specific failure these fields exist to prevent.\n\n- creator: the person or studio who MADE it — photographer, designer, art director, illustrator, agency. NEVER a discovery platform or aggregator (${knownFinderNames().join(", ")}, or any similar site the reference was merely found on). NEVER someone merely depicted — a model, a subject, a celebrity in the frame is not the creator. Use a visible credit line if the image carries one. Otherwise null.\n- rights_holder: the brand, publisher, magazine, museum or label that published or owns it. Null if unclear.\n- source_year: the year the WORK was made, from a visible date, the title, or an unmistakable citation. This is NEVER the date it was clipped or collected. Null unless stated or unambiguous.`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: input.imageUrl } },
          { type: "text", text: contextLines },
        ],
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error(
      "Classification response did not match the expected schema"
    );
  }

  logCost(response.usage);

  const a = response.parsed_output.attribution;
  // Must satisfy clips_source_year_plausible or the write is guaranteed
  // to fail the check constraint. Mirrors the range in that migration.
  const maxYear = new Date().getUTCFullYear() + 1;
  const year =
    typeof a.source_year === "number" &&
    Number.isInteger(a.source_year) &&
    a.source_year >= 1400 &&
    a.source_year <= maxYear
      ? a.source_year
      : null;

  return {
    classifications: response.parsed_output.classifications.map((c) => ({
      tagId: idByName.get(c.tag)!,
      tag: c.tag,
      confidence: Math.min(1, Math.max(0, c.confidence)),
    })),
    attribution: {
      creator: a.creator?.trim() || null,
      rightsHolder: a.rights_holder?.trim() || null,
      sourceYear: year,
    },
  };
}

/**
 * Writes inferred attribution into a clip, and ONLY into fields that are
 * still empty.
 *
 * A human typing a credit always wins over a model inferring one — this
 * never overwrites, it only fills blanks. attribution_parsed_at is
 * stamped so an inference stays distinguishable from something Daniela
 * entered by hand, which is the entire reason that column exists.
 *
 * found_via is not inferred at all: it comes from the URL host, which is
 * a fact about the clip rather than a judgement about the work.
 */
async function fillEmptyAttribution(
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
      `[classify-clip] attribution write failed for ${clipId}: ${error.message}`
    );
  }
}

// Classifies a clip and writes every returned tag to clip_tags — no
// write-time confidence threshold, so the display cutoff can be tuned
// later without re-running classification across the library. Shared by
// the create flow and the reclassify batch so the write path can't drift
// between the two.
export async function classifyAndTagClip(clip: {
  id: string;
  url: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
}): Promise<number> {
  const { classifications, attribution } = await classifyClip({
    url: clip.url,
    imageUrl: clip.imageUrl,
    title: clip.title,
    caption: clip.caption,
  });

  await fillEmptyAttribution(clip.id, clip.url, attribution);

  if (classifications.length === 0) return 0;

  const rows = classifications.map((c) => ({
    clip_id: clip.id,
    tag_id: c.tagId,
    confidence: c.confidence,
  }));

  const { error } = await supabaseAdmin
    .from("clip_tags")
    .upsert(rows, { onConflict: "clip_id,tag_id" });

  if (error) {
    throw new Error(
      `Failed to write clip_tags for clip ${clip.id}: ${error.message}`
    );
  }

  return classifications.length;
}
