// Panel + velocity diagnostic. Run it before trusting any velocity number.
//
//   node --experimental-strip-types --env-file=.env.local scripts/panel-report.ts
//   node --experimental-strip-types --env-file=.env.local scripts/panel-report.ts --at 2026-09-24
//
// --at projects the read forward to a date, holding clipping constant from
// now. That is how the 2026-08-28 finding was produced. Run it from a
// machine with network access to Supabase (not the cloud VM).
//
// This exists because the library moves faster than any document. On
// 2026-08-28 the active tag-application count changed three times inside a
// single working session, and a hardcoded projection in the handoff had
// already inverted. Numbers in docs go stale; this does not.

import { createClient } from "@supabase/supabase-js";
import { computeVelocitiesForTags } from "../lib/velocity.ts";
import {
  computePanelComposition,
  computeBalancedVelocities,
  computeVelocitiesForCurator,
  MAX_PANEL_DRIFT,
  type CuratorRow,
} from "../lib/curator-velocity.ts";

const atArg = process.argv.indexOf("--at");
const NOW = atArg > -1 ? new Date(process.argv[atArg + 1]) : new Date();
if (Number.isNaN(NOW.getTime())) {
  console.error("--at needs a parseable date, e.g. 2026-09-24");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing Supabase env. Pass --env-file=.env.local");
  process.exit(1);
}
const db = createClient(url, key);

// Page explicitly — PostgREST caps at 1000 rows by default and this table
// grows forever. Matches tag_clip_counts' archived-clip exclusion.
type Row = {
  clipped_by_name: string | null;
  clip_tags: { tag_id: string; created_at: string }[] | null;
};
const PAGE = 1000;
const clips: Row[] = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await db
    .from("clips")
    .select("clipped_by_name, clip_tags ( tag_id, created_at )")
    .is("archived_at", null)
    .range(from, from + PAGE - 1);
  if (error) throw error;
  if (!data || data.length === 0) break;
  clips.push(...(data as unknown as Row[]));
  if (data.length < PAGE) break;
}

const { data: tagRows, error: tagErr } = await db
  .from("tags")
  .select("id, editorial_name");
if (tagErr) throw tagErr;
const tagName = new Map(
  (tagRows as { id: string; editorial_name: string }[]).map((t) => [
    t.id,
    t.editorial_name,
  ])
);

const rows: CuratorRow[] = clips.flatMap((c) =>
  (c.clip_tags ?? []).map((ct) => ({
    tagId: ct.tag_id,
    curator: c.clipped_by_name,
    createdAt: ct.created_at,
  }))
);

const panel = computePanelComposition(rows, NOW);
const pooled = computeVelocitiesForTags(
  rows.map((r) => ({ tagId: r.tagId, createdAt: r.createdAt })),
  NOW
);
const balanced = computeBalancedVelocities(rows, NOW);
const curators = [...panel.baseShares.keys()].sort();
const perCurator = new Map(
  curators.map((c) => [c, computeVelocitiesForCurator(rows, c, NOW)])
);

const pct = (v: number) => (v * 100).toFixed(1) + "%";
const pts = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "null"
    : (v * 100 >= 0 ? "+" : "") + (v * 100).toFixed(2);

console.log("\n04AM PANEL REPORT   as of " + NOW.toISOString());
console.log("=".repeat(64));
console.log("clips (active)      " + clips.length);
console.log("tag-applications    " + panel.baseTotal + " all-time, " + panel.recentTotal + " in trailing 30d");
console.log("curators            " + panel.curatorCount);
for (const c of curators) {
  console.log(
    "  " + c.padEnd(16) +
    "base " + pct(panel.baseShares.get(c) ?? 0).padStart(6) +
    "   window " + pct(panel.recentShares.get(c) ?? 0).padStart(6)
  );
}
console.log("-".repeat(64));
console.log("PANEL DRIFT         " + pct(panel.drift) + "   (gate: " + pct(MAX_PANEL_DRIFT) + ")");
console.log(
  "GLOBAL NUMBER       " +
    (panel.safeForGlobalVelocity
      ? "publishable"
      : "WITHHELD - the board would describe who clipped, not what moved")
);
console.log("=".repeat(64));

const header =
  "tag".padEnd(18) + "pooled".padStart(8) + "balanced".padStart(10) +
  curators.map((c) => c.slice(0, 8).padStart(10)).join("");
console.log("\n" + header);
console.log("-".repeat(header.length));

let flips = 0;
[...pooled.keys()]
  .sort((a, b) => (pooled.get(b) ?? 0) - (pooled.get(a) ?? 0))
  .forEach((tagId) => {
    const p = pooled.get(tagId);
    const b = balanced.get(tagId);
    const flip =
      p != null && b != null && p !== 0 && b !== 0 &&
      Math.sign(p) !== Math.sign(b);
    if (flip) flips++;
    console.log(
      (tagName.get(tagId) ?? tagId).padEnd(18) +
        pts(p).padStart(8) +
        pts(b).padStart(10) +
        curators.map((c) => pts(perCurator.get(c)!.get(tagId)).padStart(10)).join("") +
        (flip ? "   <- SIGN FLIP" : "")
    );
  });

console.log(
  "\n" + flips + " of " + pooled.size +
  " tags flip sign between pooled and curator-balanced."
);
if (!panel.safeForGlobalVelocity) {
  console.log(
    "Panel drift is above the gate. Per-curator columns are the honest read today."
  );
}
console.log();
