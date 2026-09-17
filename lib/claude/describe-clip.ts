import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./admin";
import { withSpendContext } from "./spend-context.ts";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normaliseDescription } from "@/lib/search/describe-normalise";
import { normaliseColors, type ClipColor } from "@/lib/color/normalise";
import { withPrimary } from "@/lib/color/primary";

// Search descriptors for one clip: a literal description of what is in the
// image, plus the words a designer would type to find it. Written once per
// clip into clip_descriptions.
//
// This is NOT classification. It never touches clip_tags, has no axis and
// no confidence, and can never reach a count, a share, a velocity or panel
// drift. Running it on every clip moves no figure — which is also why it
// can run before the 09-26 launch, unlike a reclassification.
//
// Search-only (decided 2026-09-11): nothing in the app reads the text back.
// lib/search/search.test.ts fails if anything but this file names the table.

// Cheapest current Haiku model, verified against Anthropic's model list 2026-09-11.
// Descriptions are search-only text output (no vision reasoning depth needed).
const DESCRIBER_MODEL = "claude-haiku-4-5";

const DescriptionSchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
  colors: z.array(z.object({ hex: z.string(), coverage: z.number() })),
});

const SYSTEM = `You write search descriptors for 04AM, a library of visual design references. Designers search it in plain language — "film photography", "package design", "brutalist poster", "risograph", "3d type", "book cover", "hands", "chrome". Look at the image and return two things.

summary — one or two plain sentences on what is visibly there: the kind of work (photograph, poster, packaging, book or album cover, website, app screen, identity, illustration, 3D render, type specimen, editorial spread, signage, product, and so on), the medium or technique, the subject, notable objects, the setting, colour and light, and any typography. Literal. No praise, no guessing at intent. Name a person, brand or title only if it is legible in the image or given in the context.

keywords — 15 to 30 lowercase search terms and short phrases that a designer would actually type to find this image. Cover:
- the kind of work and its design discipline ("package design", "packaging", "editorial design", "poster design", "web design")
- medium and technique, with common synonyms ("film photography", "analog photography", "35mm", "film grain", "risograph", "screen print", "3d render", "collage")
- subject, objects and setting ("portrait", "hands", "bottle", "interior", "landscape")
- colour and light ("black and white", "monochrome", "neon", "pastel", "golden hour")
- typography, if present ("serif", "hand lettering", "bold sans")
- style or era only when clearly visible ("brutalist", "y2k", "swiss style")
Include singular forms and the everyday synonym next to the technical term. Leave out anything you are unsure of: a wrong keyword makes the image show up in the wrong search.

colors — the three to six colours that actually carry the image, each as a hex string with \`coverage\`, roughly the fraction of the frame it occupies (0 to 1). Read what is in front of you, including neutrals: a black-and-white photograph's colours are black, white and grey, and a warm paper scan is an off-white, not a yellow. Order most-present first, and leave out anything smaller than about a twentieth of the frame — a red button on a grey machine does not make the image red.`;

export type ClipDescription = {
  summary: string;
  keywords: string[];
  colors: ClipColor[];
};

export async function describeClip(input: {
  url: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
}): Promise<ClipDescription> {
  const context = [
    input.title ? `Title: ${input.title}` : null,
    input.caption ? `Caption: ${input.caption}` : null,
    `Source URL: ${input.url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await anthropic.messages.parse({
    model: DESCRIBER_MODEL,
    max_tokens: 1024,
    // Haiku 4.5 doesn't accept output_config.effort (400) — only format.
    output_config: {
      format: zodOutputFormat(DescriptionSchema),
    },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: input.imageUrl } },
          { type: "text", text: context },
        ],
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("Description response did not match the expected schema");
  }
  const u = response.usage;
  // Claude Haiku 4.5 pricing as of 2026-09-11: $1/$5 per MTok input/output,
  // cache write 1.25x input, cache read 0.1x input.
  const cost =
    (u.input_tokens / 1e6) * 1 +
    (u.output_tokens / 1e6) * 5 +
    ((u.cache_creation_input_tokens ?? 0) / 1e6) * 1.25 +
    ((u.cache_read_input_tokens ?? 0) / 1e6) * 0.1;
  console.log(
    `[describe-clip] tokens: in=${u.input_tokens} out=${u.output_tokens} — est. cost $${cost.toFixed(4)}`
  );

  return {
    ...normaliseDescription(response.parsed_output),
    colors: normaliseColors(response.parsed_output.colors ?? []),
  };
}

/** Colours for one clip, replacing whatever was there. */
async function storeColors(clipId: string, colors: ClipColor[]): Promise<void> {
  const { error: clearError } = await supabaseAdmin
    .from("clip_colors")
    .delete()
    .eq("clip_id", clipId);
  if (clearError) throw new Error(`Could not clear colours: ${clearError.message}`);
  if (colors.length === 0) return;

  const { error } = await supabaseAdmin.from("clip_colors").insert(
    withPrimary(colors).map((c) => ({
      clip_id: clipId,
      bucket: c.bucket,
      coverage: c.coverage,
      hex: c.hex,
      is_primary: c.is_primary,
      // An estimate, so the watcher knows to come back and read the pixels.
      source: "model",
      described_at: new Date().toISOString(),
    }))
  );
  if (error) throw new Error(`Could not store colours: ${error.message}`);
}

/**
 * Colours only, for the backfill over clips described before colour
 * existed. Deliberately does NOT rewrite the description: those summaries
 * and keywords are what search has been ranking on, and replacing 147 of
 * them to add a colour column would quietly change every search result.
 */
const ColorOnlySchema = z.object({
  colors: z.array(z.object({ hex: z.string(), coverage: z.number() })),
});

// The backfill's own prompt, deliberately not the describer's.
//
// A clip described before colour existed needs ONLY its colours, and the
// full describer answers with a summary and 15-30 keywords as well — about
// 500 output tokens, of which this path kept roughly sixty and binned the
// rest. Output is the expensive half of a Haiku call, so asking the smaller
// question costs roughly a third as much for exactly the same rows. No
// title or caption is sent either: neither tells you what colour something
// is.
const COLOR_SYSTEM = `Look at the image and return the three to six colours that actually carry it, each as a hex string with \`coverage\`, roughly the fraction of the frame it occupies (0 to 1).

Read what is in front of you, including neutrals: a black-and-white photograph's colours are black, white and grey, and a warm paper scan is an off-white, not a yellow. Order most-present first, and leave out anything smaller than about a twentieth of the frame — a red button on a grey machine does not make the image red.

Return nothing but the colours.`;

/**
 * Colours only, for the backfill over clips described before colour
 * existed. Deliberately does NOT rewrite the description: those summaries
 * and keywords are what search has been ranking on, and replacing them all
 * to add a colour column would quietly change every search result.
 */
export async function colorAndStoreClip(clip: {
  id: string;
  url: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
}): Promise<number> {
  return withSpendContext({ clipId: clip.id, kind: "color" }, () => colorAndStoreClipInner(clip));
}

async function colorAndStoreClipInner(clip: {
  id: string;
  imageUrl: string;
}): Promise<number> {
  const response = await anthropic.messages.parse({
    model: DESCRIBER_MODEL,
    max_tokens: 400,
    output_config: { format: zodOutputFormat(ColorOnlySchema) },
    system: [
      { type: "text", text: COLOR_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: clip.imageUrl } },
        ],
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("Colour response did not match the expected schema");
  }

  const u = response.usage;
  const cost =
    (u.input_tokens / 1e6) * 1 +
    (u.output_tokens / 1e6) * 5 +
    ((u.cache_creation_input_tokens ?? 0) / 1e6) * 1.25 +
    ((u.cache_read_input_tokens ?? 0) / 1e6) * 0.1;
  console.log(
    `[color] tokens: in=${u.input_tokens} out=${u.output_tokens} — est. cost $${cost.toFixed(5)}`
  );

  const colors = normaliseColors(response.parsed_output.colors ?? []);
  await storeColors(clip.id, colors);
  return colors.length;
}

/** Describe one clip and store it. Returns the number of keywords written. */
export async function describeAndStoreClip(clip: {
  id: string;
  url: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
}): Promise<number> {
  const description = await withSpendContext({ clipId: clip.id, kind: "describe" }, () =>
    describeClip(clip)
  );
  const { error } = await supabaseAdmin.from("clip_descriptions").upsert(
    {
      clip_id: clip.id,
      summary: description.summary,
      keywords: description.keywords,
      model: DESCRIBER_MODEL,
      described_at: new Date().toISOString(),
    },
    { onConflict: "clip_id" }
  );
  if (error) throw new Error(`Could not store description: ${error.message}`);
  // Colours come from the same call, so a new clip is described and
  // coloured for the price of one request.
  await storeColors(clip.id, description.colors);
  return description.keywords.length;
}
