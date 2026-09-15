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
  type CuratorIdentities,
} from "../lib/curator-velocity.ts";
import { getConfidence } from "../lib/confidence.ts";
import { fetchFrozenAxes } from "../lib/taxonomy-freeze.ts";
import {
  BOARD_PUBLISHES_AT,
  WITHHELD_TAG_IDS,
  publishedVelocities,
} from "../lib/publication.ts";

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

// curator_identities is deliberately unreadable by anon — it is the one
// table that would link a pen name to a person. The public read path above
// therefore cannot see it, so the mapping is fetched with the service role
// if it is present.
//
// If it is NOT present this script reports a NAME-level panel, which counts
// one person with two identities as two curators and so understates drift
// and overstates plurality. That is the confound this whole module exists
// to remove, so it is announced loudly rather than assumed away.
async function loadIdentities(): Promise<{
  identities: CuratorIdentities;
  trusted: boolean;
}> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { identities: new Map(), trusted: false };

  const admin = createClient(url!, serviceKey);
  const { data, error } = await admin
    .from("curator_identities")
    .select("name, person");
  if (error || !data) return { identities: new Map(), trusted: false };

  return {
    identities: new Map(
      (data as { name: string; person: string }[]).map((r) => [
        r.name,
        r.person,
      ])
    ),
    trusted: true,
  };
}

const { identities, trusted: identitiesTrusted } = await loadIdentities();

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

// group and published_at come along because the feed's own gate needs them:
// getConfidence takes isPublished and whether the tag's axis is frozen.
// Reproducing the feed's set by hand instead would be a second definition.
type TagRow = {
  id: string;
  editorial_name: string;
  group: string;
  published_at: string | null;
};
const { data: tagRows, error: tagErr } = await db
  .from("tags")
  .select("id, editorial_name, group, published_at");
if (tagErr) throw tagErr;
const tagMeta = new Map((tagRows as TagRow[]).map((t) => [t.id, t]));
const tagName = new Map(
  (tagRows as TagRow[]).map((t) => [t.id, t.editorial_name])
);

// Cooling is suspended on any axis still carrying incubating tags — the same
// RPC app/page.tsx reads, not a local guess at which axes those are.
const frozenAxes = await fetchFrozenAxes(db);

const rows: CuratorRow[] = clips.flatMap((c) =>
  (c.clip_tags ?? []).map((ct) => ({
    tagId: ct.tag_id,
    curator: c.clipped_by_name,
    createdAt: ct.created_at,
  }))
);

const panel = computePanelComposition(rows, identities, NOW);
const pooled = computeVelocitiesForTags(
  rows.map((r) => ({ tagId: r.tagId, createdAt: r.createdAt })),
  NOW
);
const balanced = computeBalancedVelocities(rows, identities, NOW);
// Keyed by person. computeVelocitiesForCurator still reads one IDENTITY's
// own history, which is the right unit for a per-profile page; here it is
// called per person, so a person holding two names is read under whichever
// name they clip as. Fine while nobody does; revisit if that changes.
const people = [...panel.baseShares.keys()].sort();
const perCurator = new Map(
  people.map((c) => [c, computeVelocitiesForCurator(rows, c, NOW)])
);

// ── What the feed will actually rank by ──────────────────────────────
// Reproduced by CALLING the feed's own two gates in the feed's own order,
// not by describing them: getConfidence (count band, age band, Cooling,
// panel safety) and then publishedVelocities (the publish date and the
// hold list). The hold list used to live here as a comment and in
// lib/publication.ts as code, which meant the board could be written
// around one list while the feed ranked by another — the exact bug
// lib/publication.ts exists to prevent, reintroduced one surface over.
//
// Mirrors app/page.tsx: published tags only, same inputs, same order.
// CuratorRow.createdAt is Date | string, so normalise to epoch ms once
// rather than sorting a mixed array — a lexical sort over mixed types is
// the kind of thing that looks right on this data and breaks on the next.
const refsByTag = new Map<string, number[]>();
for (const r of rows) {
  const at = new Date(r.createdAt).getTime();
  if (Number.isNaN(at)) continue;
  const list = refsByTag.get(r.tagId) ?? [];
  list.push(at);
  refsByTag.set(r.tagId, list);
}
const confident = new Map<string, number>();
for (const [tagId, meta] of tagMeta) {
  if (meta.published_at === null) continue;
  const refs = refsByTag.get(tagId);
  if (!refs || refs.length === 0) continue;
  const { velocity } = getConfidence({
    referenceCount: refs.length,
    // Reduce rather than Math.min(...refs): the spread throws RangeError
    // once a tag carries enough references, and this list only grows.
    earliestReferenceAt: new Date(refs.reduce((a, b) => (b < a ? b : a))),
    latestReferenceAt: new Date(refs.reduce((a, b) => (b > a ? b : a))),
    velocity: pooled.get(tagId) ?? null,
    panelSafeForGlobalVelocity: panel.safeForGlobalVelocity,
    coolingSuspended: frozenAxes.has(meta.group),
    isPublished: true,
  });
  if (velocity !== null) confident.set(tagId, velocity);
}
const feedRanks = publishedVelocities(confident, NOW.getTime());

const pct = (v: number) => (v * 100).toFixed(1) + "%";
const pts = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "null"
    : (v * 100 >= 0 ? "+" : "") + (v * 100).toFixed(2);

console.log("\n04AM PANEL REPORT   as of " + NOW.toISOString());
console.log("=".repeat(64));
console.log("clips (active)      " + clips.length);
console.log("tag-applications    " + panel.baseTotal + " all-time, " + panel.recentTotal + " in trailing 30d");
console.log("people              " + panel.personCount);
if (!identitiesTrusted) {
  console.log(
    "  !! curator_identities unreadable — this is a NAME-level panel."
  );
  console.log(
    "     Drift is understated if any person holds two identities."
  );
  console.log(
    "     Re-run with SUPABASE_SERVICE_ROLE_KEY in the env file."
  );
}
for (const c of people) {
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
  people.map((c) => c.slice(0, 8).padStart(10)).join("");
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
        people.map((c) => pts(perCurator.get(c)!.get(tagId)).padStart(10)).join("") +
        (flip ? "   <- SIGN FLIP" : "") +
        (WITHHELD_TAG_IDS.has(tagId) ? "   [HELD]" : "")
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

// The board is written from this list and nothing else. A tag above the line
// but missing here is one the feed will not rank by, so the board claiming it
// moved is a claim no surface supports.
console.log("\n" + "=".repeat(64));
console.log("THE FEED RANKS BY, as of " + NOW.toISOString());
console.log("=".repeat(64));
if (NOW.getTime() < BOARD_PUBLISHES_AT) {
  console.log(
    "NOTHING - the board publishes at " +
      new Date(BOARD_PUBLISHES_AT).toISOString() +
      ",\n          and the feed ranks by no figure before that moment."
  );
  console.log(
    "\n" + confident.size + " tag(s) would qualify on confidence alone; " +
    [...confident.keys()].filter((id) => !WITHHELD_TAG_IDS.has(id)).length +
    " of those are not held back."
  );
} else if (feedRanks.size === 0) {
  console.log("NOTHING - every confident tag is on the hold list.");
} else {
  for (const [tagId, v] of [...feedRanks].sort((a, b) => b[1] - a[1])) {
    console.log("  " + (tagName.get(tagId) ?? tagId).padEnd(18) + pts(v).padStart(8));
  }
}
const heldAndConfident = [...confident.keys()].filter((id) =>
  WITHHELD_TAG_IDS.has(id)
);
if (heldAndConfident.length > 0) {
  console.log(
    "\nHELD BACK (" + heldAndConfident.length + "): " +
      heldAndConfident.map((id) => tagName.get(id) ?? id).join(", ")
  );
  console.log("  Confident, but withheld by lib/publication.ts. Keep them out of the copy.");
}
console.log();
