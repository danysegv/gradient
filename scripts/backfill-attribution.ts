// Fill attribution on clips that are already tagged.
//
//   dry run (default, writes nothing):
//     node --conditions=react-server --experimental-strip-types \
//       --env-file=.env.local scripts/backfill-attribution.ts --limit 5
//
//   apply:
//     node --conditions=react-server --experimental-strip-types \
//       --env-file=.env.local scripts/backfill-attribution.ts --apply
//
// --conditions=react-server is required: these modules import "server-only",
// which throws by design outside a server component. That flag resolves it
// to the empty module Next uses.
//
// Run on a machine with network access to Supabase and the Anthropic API
// (the cloud VM has neither).
//
// Uses extractAttribution, NOT the full classifier: these clips already
// have correct tags, and re-classifying would upsert clip_tags and churn
// confidences that are already right — paying more for a worse outcome.
//
// Every write goes through fillEmptyAttribution, so it can only ever fill
// EMPTY fields. Safe to re-run; safe to interrupt.

import { supabaseAdmin } from "../lib/supabase/admin.ts";
import { extractAttribution } from "../lib/claude/attribution-extract.ts";
import { fillEmptyAttribution } from "../lib/clips/write-attribution.ts";

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 500;

if (!Number.isInteger(LIMIT) || LIMIT < 1) {
  console.error("--limit needs a positive whole number");
  process.exit(1);
}

type Row = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  caption: string | null;
  creator: string | null;
  rights_holder: string | null;
  source_year: number | null;
};

const { data, error } = await supabaseAdmin
  .from("clips")
  .select("id, url, image_url, title, caption, creator, rights_holder, source_year")
  .is("archived_at", null)
  .is("creator", null)
  .not("image_url", "is", null)
  .order("clipped_at", { ascending: true })
  .limit(LIMIT);

if (error) throw error;
const clips = (data ?? []) as Row[];

console.log(
  `\n${APPLY ? "APPLYING" : "DRY RUN — nothing will be written"}: ${clips.length} clips\n` +
    "=".repeat(78)
);

let filled = 0;
let empty = 0;
let failed = 0;

for (const [i, clip] of clips.entries()) {
  const label = (clip.title ?? clip.url).slice(0, 52);
  try {
    const a = await extractAttribution({
      url: clip.url,
      imageUrl: clip.image_url!,
      title: clip.title,
      caption: clip.caption,
    });

    const parts = [
      a.creator ? `creator=${a.creator}` : null,
      a.rightsHolder ? `rights=${a.rightsHolder}` : null,
      a.sourceYear ? `year=${a.sourceYear}` : null,
    ].filter(Boolean);

    if (parts.length === 0) {
      empty++;
      console.log(`${String(i + 1).padStart(3)}. ${label}\n     — nothing confident, left null`);
    } else {
      filled++;
      console.log(`${String(i + 1).padStart(3)}. ${label}\n     ${parts.join("  |  ")}`);
      if (APPLY) await fillEmptyAttribution(clip.id, clip.url, a);
    }
  } catch (e) {
    failed++;
    console.log(
      `${String(i + 1).padStart(3)}. ${label}\n     FAILED: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

console.log(
  "=".repeat(78) +
    `\n${filled} with a credit · ${empty} left null · ${failed} failed` +
    (APPLY ? "\nWritten. Fields that already had a value were not touched." : "\nDry run — nothing written. Re-run with --apply.") +
    "\nPer-call cost is logged above by [classify-clip].\n"
);
