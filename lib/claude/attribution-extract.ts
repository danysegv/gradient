import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./admin.ts";
import { knownFinderNames } from "../clips/attribution.ts";

// Extension-ful, relative imports throughout this module and the two it
// pulls from, so it can be run by plain Node as well as by Next. That is
// what lets scripts/backfill-attribution.ts reuse the exact extraction
// the app uses instead of keeping a second copy of these rules.

const MODEL = "claude-opus-5";

export type Attribution = {
  /** Who MADE it. Never an aggregator, never a subject or model. */
  creator: string | null;
  /** Who published or owns it — brand, publisher, magazine, museum. */
  rightsHolder: string | null;
  /** Year the WORK was made. Never the clip date. */
  sourceYear: number | null;
};

export const AttributionShape = {
  creator: z.string().nullable(),
  rights_holder: z.string().nullable(),
  source_year: z.number().nullable(),
};

/**
 * One definition of the attribution rules, used by BOTH the combined
 * classify+attribute call on new clips and the attribution-only call that
 * backfills clips which are already tagged. Two copies of a prompt this
 * opinionated would drift, and the point is that the rules are identical
 * wherever a credit gets written.
 */
export function attributionInstructions(): string {
  return [
    "ATTRIBUTION.",
    "",
    "Extract who made the work. Be conservative: null is the correct answer far more often than a guess, and a WRONG credit is worse than no credit. Crediting an aggregator for someone else's work is the specific failure these fields exist to prevent.",
    "",
    `- creator: the person or studio who MADE it — photographer, designer, art director, illustrator, agency. NEVER a discovery platform or aggregator (${knownFinderNames().join(", ")}, or any similar site the reference was merely found on). NEVER someone merely depicted — a model, a subject, a celebrity in the frame is not the creator. Use a visible credit line if the image carries one. Otherwise null.`,
    "- rights_holder: the brand, publisher, magazine, museum or label that published or owns it. Null if unclear.",
    "- source_year: the year the WORK was made, from a visible date, the title, or an unmistakable citation. This is NEVER the date it was clipped or collected. Null unless stated or unambiguous.",
  ].join("\n");
}

/** Clamp to what clips_source_year_plausible will actually accept. */
export function plausibleYear(value: number | null): number | null {
  const max = new Date().getUTCFullYear() + 1;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1400 &&
    value <= max
    ? value
    : null;
}

export function normaliseAttribution(a: {
  creator: string | null;
  rights_holder: string | null;
  source_year: number | null;
}): Attribution {
  return {
    creator: a.creator?.trim() || null,
    rightsHolder: a.rights_holder?.trim() || null,
    sourceYear: plausibleYear(a.source_year),
  };
}

/**
 * Attribution WITHOUT re-running tag classification.
 *
 * For backfilling clips that are already tagged: re-classifying them
 * would upsert clip_tags and churn confidences that are already correct —
 * paying more for a worse outcome. This sends the image and the
 * attribution rules only: no taxonomy in the prompt, no tag list in the
 * output, so it is markedly cheaper per clip.
 */
export async function extractAttribution(input: {
  url: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
}): Promise<Attribution> {
  const contextLines = [
    input.title ? `Title: ${input.title}` : null,
    input.caption ? `Caption: ${input.caption}` : null,
    `Source URL: ${input.url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: {
      effort: "low",
      format: zodOutputFormat(z.object(AttributionShape)),
    },
    system: [
      {
        type: "text",
        text: attributionInstructions(),
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
    throw new Error("Attribution response did not match the expected schema");
  }
  return normaliseAttribution(response.parsed_output);
}
