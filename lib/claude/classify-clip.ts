import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  attributionInstructions,
  AttributionShape,
  normaliseAttribution,
  type Attribution,
} from "./attribution-extract";
import { fillEmptyAttribution } from "@/lib/clips/write-attribution";


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

export type { Attribution };

export type ClipReading = {
  classifications: Classification[];
  attribution: Attribution;
};

export type Classification = {
  tagId: string;
  tag: string;
  /** The tag's axis. */
  group: string;
  /** Whether the tag is in the published vocabulary. Carried so the
   * backfill can write ONLY incubating tags — see
   * classifyAndTagClipIncubatingOnly. */
  isPublished: boolean;
  confidence: number;
};


// The AI classifier skips `format_motion` entirely in v1 (locked scope
// decision) — MotionLoop/StoryScroll are applied by hand at clip time.
//
// It sees the WHOLE vocabulary, incubating tags included. Reversed
// 2026-09-08: the freeze is a freeze on published FIGURES, not on the
// taxonomy. An incubating tag is applied to clips and shown in the
// product from day one; what it never gets is a velocity, because it is
// excluded from the library-wide denominator those figures are shares
// of. That exclusion lives in the read path — see lib/taxonomy-freeze.ts.
export async function classifyClip(input: {
  url: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
}): Promise<ClipReading> {
  const { data: tags, error } = await supabaseAdmin
    .from("tags")
    .select("id, group, editorial_name, universal_term, description, published_at")
    .neq("group", "format_motion");

  if (error || !tags || tags.length === 0) {
    throw new Error(`Could not load taxonomy: ${error?.message ?? "no tags"}`);
  }

  const validNames = tags.map((t) => t.editorial_name) as [
    string,
    ...string[],
  ];
  const idByName = new Map(tags.map((t) => [t.editorial_name, t.id]));
  const groupByName = new Map(
    tags.map((t) => [t.editorial_name, t.group as string])
  );
  const publishedByName = new Map(
    tags.map((t) => [t.editorial_name, t.published_at !== null])
  );

  const ClassificationSchema = z.object({
    classifications: z.array(
      z.object({
        tag: z.enum(validNames),
        confidence: z.number(),
      })
    ),
    attribution: z.object(AttributionShape),
  });

  const taxonomyDescription = tags
    .map(
      (t) =>
        `- ${t.editorial_name} (${t.group}, aka "${t.universal_term}"): ${t.description}`
    )
    .join("\n");

  // The prompt used to hardcode "five axes (movement, typography,
  // palette_light, layout, treatment)". With medium and subject arriving
  // frozen, a literal would have been wrong in both directions: eight
  // while the model can still only see five, then wrong again if the
  // taxonomy ever moves. Deriving it from the loaded taxonomy is correct
  // at every point in the incubation and needs no edit on 09-27.
  const AXIS_ORDER = [
    "movement",
    "typography",
    "palette_light",
    "layout",
    "treatment",
    "medium",
    "subject",
    "format_motion",
  ];
  const rank = (g: string) => {
    const i = AXIS_ORDER.indexOf(g);
    return i === -1 ? AXIS_ORDER.length : i;
  };
  const axes = [...new Set(tags.map((t) => t.group as string))].sort(
    (a, b) => rank(a) - rank(b)
  );
  const NUMBER_WORDS = [
    "zero", "one", "two", "three", "four", "five",
    "six", "seven", "eight", "nine", "ten",
  ];
  const axisCount = NUMBER_WORDS[axes.length] ?? String(axes.length);

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
        text: `You are classifying a design reference image against 04AM's taxonomy — a faceted system across ${axisCount} axes (${axes.join(", ")}). A single image can carry a tag from every axis at once, or none from a given axis if nothing genuinely fits. For each axis, pick at most the single best-matching tag — never force a weak match. Rate your confidence in each tag from 0 to 1, calibrated to how clearly the image exhibits it.\n\nTaxonomy:\n${taxonomyDescription}\n\nSECOND TASK — ${attributionInstructions()}`,
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

  const attribution = normaliseAttribution(response.parsed_output.attribution);

  return {
    classifications: response.parsed_output.classifications.map((c) => ({
      tagId: idByName.get(c.tag)!,
      tag: c.tag,
      group: groupByName.get(c.tag)!,
      isPublished: publishedByName.get(c.tag)!,
      confidence: Math.min(1, Math.max(0, c.confidence)),
    })),
    attribution,
  };
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


// ---------------------------------------------------------------------
// The incubating-vocabulary backfill.
//
// Reads a clip that is ALREADY classified against the old taxonomy and
// writes only the tags it earns from the NEW vocabulary. Additive by
// construction: it never deletes, and never writes a published tag.
//
// ⚠ WHY IT CANNOT JUST CALL classifyAndTagClip.
// The five original axes are single-select. classifyAndTagClip writes
// every tag the model returns and upserts on (clip_id, tag_id), so on an
// already-tagged clip it does not REPLACE the layout tag — a different
// tag_id is a different row, and the clip ends up carrying two published
// layout tags. Every share and co-occurrence figure in the product is
// computed against one-per-axis; breaking it silently corrupts all of
// them.
//
// Filtering to incubating tags avoids that completely, and gives the
// stronger guarantee the whole backfill rests on: **no published
// clip_tags row is created, changed or deleted**, so no published number
// can move. A clip may temporarily hold both RawAsymmetry (published)
// and HardCrop (incubating) on the layout axis. That duplication is
// deliberate and invisible — incubating tags are excluded from every
// denominator — and graduation is where one of the two is chosen.
export async function classifyAndTagClipIncubatingOnly(clip: {
  id: string;
  url: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
}): Promise<number> {
  const { classifications } = await classifyClip({
    url: clip.url,
    imageUrl: clip.imageUrl,
    title: clip.title,
    caption: clip.caption,
  });

  // Attribution is deliberately NOT written here. This path revisits
  // clips that were already read once; fillEmptyAttribution belongs to
  // the create flow and re-running it is out of scope for a backfill.
  const incubating = classifications.filter((c) => !c.isPublished);
  if (incubating.length === 0) return 0;

  const { error } = await supabaseAdmin.from("clip_tags").upsert(
    incubating.map((c) => ({
      clip_id: clip.id,
      tag_id: c.tagId,
      confidence: c.confidence,
    })),
    { onConflict: "clip_id,tag_id" }
  );

  if (error) {
    throw new Error(
      `Failed to write clip_tags for clip ${clip.id}: ${error.message}`
    );
  }

  return incubating.length;
}
