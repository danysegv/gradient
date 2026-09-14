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
//   re-read only the clips still on the describer's estimate (what the
//   watcher runs — see scripts/install-colour-watcher.sh):
//     node --conditions=react-server --experimental-strip-types \
//       --env-file=.env.local scripts/read-colors.ts --apply --stale
//
//   re-read clips that already have colours, overwriting them:
//     node --conditions=react-server --experimental-strip-types \
//       --env-file=.env.local scripts/read-colors.ts --apply --refresh
//
// --refresh exists because a clip added through /clip gets its colours from
// the Haiku describer's estimate (they ride along in the call already being
// made for the search description) rather than from its pixels. Without
// this flag those clips are never revisited: the queue only returns clips
// with NO colours. Run it before anything that depends on colour being
// exact, and the whole library ends up read the same way.
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
import { withPrimary } from "../lib/color/primary.ts";

const APPLY = process.argv.includes("--apply");
const REFRESH = process.argv.includes("--refresh");
// --stale: only clips whose colours are the describer's estimate. This is
// what the watcher runs, so a clip added through /clip is searchable by
// colour immediately (on the estimate) and reading its actual pixels costs
// one fetch a few minutes later instead of re-reading the whole library.
const STALE = process.argv.includes("--stale");
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

let clips: Clip[];
if (STALE) {
  const { data: rows, error: staleError } = await supabaseAdmin
    .from("clip_colors")
    .select("clip_id")
    .eq("source", "model");
  if (staleError) throw new Error(`clip_colors: ${staleError.message}`);
  const ids = [...new Set((rows ?? []).map((r) => r.clip_id as string))];
  if (ids.length === 0) {
    clips = [];
  } else {
    const { data, error } = await supabaseAdmin
      .from("clips")
      .select("id, url, image_url, title")
      .in("id", LIMIT ? ids.slice(0, LIMIT) : ids)
      .is("archived_at", null)
      .not("image_url", "is", null);
    if (error) throw new Error(`clips: ${error.message}`);
    clips = (data ?? []) as Clip[];
  }
} else if (REFRESH) {
  // Every active clip with an image, parked ones excluded, newest first —
  // the same population the queue draws from, minus the "no colours yet"
  // condition.
  let query = supabaseAdmin
    .from("clips")
    .select("id, url, image_url, title")
    .is("archived_at", null)
    .not("image_url", "is", null)
    .order("clipped_at", { ascending: false });
  if (LIMIT) query = query.limit(LIMIT);
  const { data, error } = await query;
  if (error) throw new Error(`clips: ${error.message}`);
  const parked = await supabaseAdmin
    .from("clip_classification_failures")
    .select("clip_id");
  const skip = new Set((parked.data ?? []).map((r) => r.clip_id as string));
  clips = ((data ?? []) as Clip[]).filter((c) => !skip.has(c.id));
} else {
  const { data, error } = await supabaseAdmin.rpc("clips_missing_colors", {
    row_limit: LIMIT,
  });
  if (error) throw new Error(`clips_missing_colors: ${error.message}`);
  clips = (data ?? []) as Clip[];
}

console.log(
  `${clips.length} clip${clips.length === 1 ? "" : "s"} ` +
    (STALE
      ? "still on the describer's estimate"
      : REFRESH
        ? "to re-read (overwriting existing colours)"
        : "without colours") +
    (APPLY ? "" : " — DRY RUN, nothing will be written")
);

let done = 0;
let failed = 0;
for (const clip of clips) {
  const label = clip.title ?? clip.url;
  try {
    const colors = withPrimary(colorsFromPixels(await pixelsFor(clip.image_url), 4));
    if (colors.length === 0) {
      console.warn(`  · ${label} — no readable colour, skipped`);
      failed += 1;
      continue;
    }
    // The primary is what the clip is FILED under and the only thing search
    // matches, so it leads the line; the rest is the breakdown behind it.
    const primary = colors.find((c) => c.is_primary);
    const rest = colors
      .filter((c) => !c.is_primary)
      .map((c) => `${c.bucket} ${(c.coverage * 100).toFixed(0)}%`)
      .join(", ");
    console.log(
      `  ✓ ${primary ? primary.bucket.toUpperCase().padEnd(6) : "??????"} ` +
        `${primary ? String(Math.round(primary.coverage * 100)).padStart(3) + "%" : "    "}` +
        `  ${label}${rest ? `  ·  ${rest}` : ""}`
    );

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
          is_primary: c.is_primary,
          source: "pixels",
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
