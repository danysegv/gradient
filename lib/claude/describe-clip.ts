import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normaliseDescription } from "@/lib/search/describe-normalise";

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

const DESCRIBER_MODEL = "claude-opus-5";

const DescriptionSchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
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
Include singular forms and the everyday synonym next to the technical term. Leave out anything you are unsure of: a wrong keyword makes the image show up in the wrong search.`;

export type ClipDescription = { summary: string; keywords: string[] };

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
    output_config: {
      effort: "low",
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
  const cost =
    (u.input_tokens / 1e6) * 5 +
    (u.output_tokens / 1e6) * 25 +
    ((u.cache_creation_input_tokens ?? 0) / 1e6) * 6.25 +
    ((u.cache_read_input_tokens ?? 0) / 1e6) * 0.5;
  console.log(
    `[describe-clip] tokens: in=${u.input_tokens} out=${u.output_tokens} — est. cost $${cost.toFixed(4)}`
  );

  return normaliseDescription(response.parsed_output);
}

/** Describe one clip and store it. Returns the number of keywords written. */
export async function describeAndStoreClip(clip: {
  id: string;
  url: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
}): Promise<number> {
  const description = await describeClip(clip);
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
  return description.keywords.length;
}
