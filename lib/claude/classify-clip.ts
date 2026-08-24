import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

// The AI classifier skips `format_motion` entirely in v1 (locked scope
// decision) — MotionLoop/StoryScroll are applied by hand at clip time.
export async function classifyClip(input: {
  url: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
}): Promise<Classification[]> {
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
        text: `You are classifying a design reference image against 04AM's taxonomy — a faceted system across five axes (movement, typography, palette_light, layout, treatment). A single image can carry a tag from every axis at once, or none from a given axis if nothing genuinely fits. For each axis, pick at most the single best-matching tag — never force a weak match. Rate your confidence in each tag from 0 to 1, calibrated to how clearly the image exhibits it.\n\nTaxonomy:\n${taxonomyDescription}`,
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

  return response.parsed_output.classifications.map((c) => ({
    tagId: idByName.get(c.tag)!,
    tag: c.tag,
    confidence: Math.min(1, Math.max(0, c.confidence)),
  }));
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
  const classifications = await classifyClip({
    url: clip.url,
    imageUrl: clip.imageUrl,
    title: clip.title,
    caption: clip.caption,
  });

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
