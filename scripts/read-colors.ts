// Read every clip's dominant colours from its pixels. No model, no API key,
// no cost.
//
//   dry run (default, writes nothing):
//     node --conditions=react-server --experimental-strip-types \
//       --env-file=.env.local scripts/read-colors.ts --limit 5
//
//   apply:
//     node --conditions=react-server --experimental-strip-types \
//       --env-file=.env.local scripts/read-colors.ts --apply
//
// --conditions=react-server is required: these modules import "server-only",
// which throws by design outside a server component. That flag resolves it
// to the empty module Next uses.
//
// Run on a machine with network access to Supabase and to the image hosts
// (the cloud VM has neither). Needs sharp: npm i -D sharp
//
// WHY THIS EXISTS. Colour used to come back from the Haiku describer, which
// worked but cost money per clip forever and asked a vision model to
// estimate hex values by eye. Dominant colour is pixel arithmetic. Reading
// it locally is free, exact, and — because every pixel goes through the
// SAME bucketOf the search uses — extraction and search agree by
// construction instead of by coincidence.
//
// Writes clip_colors ONLY. No tag is created, changed or re-dated; nothing
// here can move a count, a share, a velocity or panel drift. Safe to
// re-run, safe to interrupt: each clip's colours are replaced whole.

import sharp from "sharp";
import { supabaseAdmin } from "../lib/supabase/admin.ts";
import { colorsFromPixels } from "../lib/color/extract.ts";

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : null;

// Colour survives aggressive downsampling — a 64px thumbnail has the same
// palette as the original and decodes in milliseconds.
const SAMPLE = 64;
const FETCH_TIMEOUT_MS = 20_000;

type Clip = { id: string; url: string; image_url: string; title: string | null };

async function pixelsFor(imageUrl: string): Promise<Uint8Array> {
  const res = await fetch(imageUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "04AM colour reader" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { data } = await sharp(buf)
    .resize(SAMPLE, SAMPLE, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

const { data, error } = await supabaseAdmin.rpc("clips_missing_colors", {
  row_limit: LIMIT,
});
if (error) throw new Error(`clips_missing_colors: ${error.message}`);
const clips = (data ?? []) as Clip[];

console.log(
  `${clips.length} clip${clips.length === 1 ? "" : "s"} without colours` +
    (APPLY ? "" : " — DRY RUN, nothing will be written")
);

let done = 0;
let failed = 0;
for (const clip of clips) {
  const label = clip.title ?? clip.url;
  try {
    const colors = colorsFromPixels(await pixelsFor(clip.image_url), 4);
    if (colors.length === 0) {
      console.warn(`  · ${label} — no readable colour, skipped`);
      failed += 1;
      continue;
    }
    const summary = colors
      .map((c) => `${c.bucket} ${(c.coverage * 100).toFixed(0)}%`)
      .join(", ");
    console.log(`  ✓ ${label} — ${summary}`);

    if (APPLY) {
      const { error: clearError } = await supabaseAdmin
        .from("clip_colors")
        .delete()
        .eq("clip_id", clip.id);
      if (clearError) throw new Error(clearError.message);
      const { error: insertError } = await supabaseAdmin.from("clip_colors").insert(
        colors.map((c) => ({
          clip_id: clip.id,
          bucket: c.bucket,
          coverage: c.coverage,
          hex: c.hex,
        }))
      );
      if (insertError) throw new Error(insertError.message);
    }
    done += 1;
  } catch (err) {
    failed += 1;
    console.warn(`  ✗ ${label} — ${err instanceof Error ? err.message : err}`);
  }
}

console.log(
  `\n${done} read, ${failed} skipped.` +
    (APPLY ? "" : "\nRe-run with --apply to write them.")
);
