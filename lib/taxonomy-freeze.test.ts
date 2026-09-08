import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fetchFrozenAxes, NEW_VOCABULARY_OPENED } from "./taxonomy-freeze.ts";
import { getConfidence, COOLING_DAYS } from "./confidence.ts";
import { computeTagVelocity, computeVelocitiesForTags } from "./velocity.ts";

const NOW = new Date("2026-09-26T04:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}
function apps(tagId: string, n: number, ageDays: number) {
  return Array.from({ length: n }, () => ({ tagId, createdAt: daysAgo(ageDays) }));
}
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(full));
    // Test files name these symbols in order to assert about them.
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
      out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------
// A uniformly-applied tag resolves to velocity 0.
// ---------------------------------------------------------------------

test("a uniformly-applied tag has velocity exactly 0", () => {
  const v = computeTagVelocity({
    tagReferenceDates: [
      ...Array.from({ length: 5 }, () => daysAgo(10)),
      ...Array.from({ length: 5 }, () => daysAgo(60)),
    ],
    allReferenceDates: [
      ...Array.from({ length: 50 }, () => daysAgo(10)),
      ...Array.from({ length: 50 }, () => daysAgo(60)),
    ],
    now: NOW,
  });
  assert.equal(v, 0);
});

test("uniform application is 0 at any share of the library", () => {
  for (const share of [1, 5, 13, 25, 49]) {
    assert.equal(
      computeTagVelocity({
        tagReferenceDates: [
          ...Array.from({ length: share }, () => daysAgo(10)),
          ...Array.from({ length: share }, () => daysAgo(60)),
        ],
        allReferenceDates: [
          ...Array.from({ length: 100 }, () => daysAgo(10)),
          ...Array.from({ length: 100 }, () => daysAgo(60)),
        ],
        now: NOW,
      }),
      0,
      `share ${share} should be flat`
    );
  }
});

// ---------------------------------------------------------------------
// An incubating tag is absent from every published DENOMINATOR.
//
// This is the whole of the radar freeze, and the failure it guards is
// specific: leaving incubating applications in the library-wide
// denominator while withholding their velocity. Nothing looks wrong —
// the new tags show no numbers, exactly as intended — and every
// incumbent quietly loses share. Every figure stays internally
// consistent. All of them are wrong.
//
// The backfill makes this live rather than theoretical: it writes a few
// hundred applications, all timestamped now, all inside the trailing
// window. Left in the denominator they would crush every incumbent's
// recentShare.
// ---------------------------------------------------------------------

const PUBLISHED = [
  ...apps("RawAsymmetry", 40, 60),
  ...apps("RawAsymmetry", 19, 10),
  ...apps("AnalogNoise", 38, 60),
  ...apps("AnalogNoise", 20, 10),
  ...apps("Poetcore", 10, 60),
  ...apps("Poetcore", 12, 10),
];
// What the backfill writes: new-vocabulary applications, all recent.
const INCUBATING = [...apps("HardCrop", 15, 1), ...apps("FigureWork", 30, 1)];
const INCUBATING_IDS = new Set(["HardCrop", "FigureWork"]);

test("incubating rows in the denominator move every published number", () => {
  const clean = computeVelocitiesForTags(PUBLISHED, NOW);
  const leaked = computeVelocitiesForTags([...PUBLISHED, ...INCUBATING], NOW);

  // Guard the guard: if this stops differing the fixture is inert and the
  // test below proves nothing.
  for (const tag of ["RawAsymmetry", "AnalogNoise", "Poetcore"]) {
    assert.notEqual(clean.get(tag), leaked.get(tag), `${tag} should be diluted`);
  }
  const drop =
    (clean.get("RawAsymmetry") ?? 0) - (leaked.get("RawAsymmetry") ?? 0);
  assert.ok(
    drop * 100 > 3,
    `expected a multi-point drop, got ${(drop * 100).toFixed(2)} pts`
  );
});

test("excluding incubating rows from BOTH sides leaves figures byte-identical", () => {
  const before = computeVelocitiesForTags(PUBLISHED, NOW);
  const after = computeVelocitiesForTags(
    [...PUBLISHED, ...INCUBATING].filter((r) => !INCUBATING_IDS.has(r.tagId)),
    NOW
  );
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [tag, v] of before) assert.equal(after.get(tag), v, `${tag} moved`);
});

// ---------------------------------------------------------------------
// The Incubating band.
// ---------------------------------------------------------------------

test("an incubating tag never carries a velocity", () => {
  const c = getConfidence({
    referenceCount: 90,
    earliestReferenceAt: daysAgo(200),
    latestReferenceAt: daysAgo(1),
    velocity: 0.12,
    isPublished: false,
    now: NOW,
  });
  assert.equal(c.incubating, true);
  assert.equal(c.label, "Incubating");
  assert.equal(c.velocity, null, "a share of a total it is not part of");
});

test("Incubating outranks Cooling and Early Signal", () => {
  const stale = getConfidence({
    referenceCount: 90,
    earliestReferenceAt: daysAgo(200),
    latestReferenceAt: daysAgo(COOLING_DAYS + 5),
    velocity: -0.02,
    isPublished: false,
    now: NOW,
  });
  assert.equal(stale.label, "Incubating");

  const thin = getConfidence({
    referenceCount: 2,
    earliestReferenceAt: daysAgo(200),
    latestReferenceAt: daysAgo(1),
    velocity: 0.02,
    isPublished: false,
    now: NOW,
  });
  assert.equal(thin.label, "Incubating");
});

test("a published tag is unaffected by the new flag", () => {
  const input = {
    referenceCount: 60,
    earliestReferenceAt: daysAgo(200),
    latestReferenceAt: daysAgo(1),
    velocity: 0.03,
    now: NOW,
  };
  const implicit = getConfidence(input);
  const explicit = getConfidence({ ...input, isPublished: true });
  assert.equal(implicit.incubating, false);
  assert.equal(implicit.velocity, 0.03);
  assert.deepEqual(explicit, implicit);
});

// ---------------------------------------------------------------------
// Cooling suspension on a widened axis.
// ---------------------------------------------------------------------

const STALE = {
  referenceCount: 30,
  earliestReferenceAt: daysAgo(60),
  latestReferenceAt: daysAgo(COOLING_DAYS + 2),
  velocity: -0.02,
  now: NOW,
};

test("a stale published tag still reads Cooling by default", () => {
  const c = getConfidence(STALE);
  assert.equal(c.cooling, true);
  assert.equal(c.label, "Cooling");
  assert.equal(c.velocity, null);
});

test("suspending Cooling on a widened axis withholds the false signal", () => {
  const c = getConfidence({ ...STALE, coolingSuspended: true });
  assert.equal(c.cooling, false);
  assert.notEqual(c.label, "Cooling");
  assert.equal(c.velocity, -0.02, "diverted, not dying");
});

test("suspension does not bypass the count band or the age gate", () => {
  const thin = getConfidence({
    referenceCount: 3,
    earliestReferenceAt: daysAgo(90),
    latestReferenceAt: daysAgo(60),
    velocity: 0.05,
    coolingSuspended: true,
    now: NOW,
  });
  assert.equal(thin.band, "early-signal");
  assert.equal(thin.velocity, null);

  const young = getConfidence({
    referenceCount: 50,
    earliestReferenceAt: daysAgo(10),
    latestReferenceAt: daysAgo(1),
    velocity: 0.05,
    coolingSuspended: true,
    now: NOW,
  });
  assert.equal(young.band, "early-signal", "45-day age gate still applies");
  assert.equal(young.velocity, null);
});

// ---------------------------------------------------------------------
// fetchFrozenAxes fails to today's behaviour, not a blanket suspension.
// ---------------------------------------------------------------------

test("fetchFrozenAxes returns the axes carrying incubating tags", async () => {
  const axes = await fetchFrozenAxes({
    rpc: async () => ({
      data: [{ group: "layout" }, { group: "medium" }],
      error: null,
    }),
  });
  assert.equal(axes.has("layout"), true);
  assert.equal(axes.has("medium"), true);
  assert.equal(axes.has("movement"), false);
});

test("fetchFrozenAxes returns empty on error — no blanket suspension", async () => {
  assert.equal(
    (await fetchFrozenAxes({
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    })).size,
    0
  );
  assert.equal(
    (await fetchFrozenAxes({
      rpc: async () => ({ data: { not: "an array" }, error: null }),
    })).size,
    0
  );
});

// ---------------------------------------------------------------------
// Source-level guards. These are the invariants that cannot be exercised
// without standing up Supabase and the Anthropic API, and they are the
// expensive ones to lose silently.
// ---------------------------------------------------------------------

test("the backfill writes only incubating tags", () => {
  const src = readFileSync("lib/claude/classify-clip.ts", "utf8");
  assert.match(src, /classifications\.filter\(\(c\) => !c\.isPublished\)/);
});

test("the classifier write path never deletes a clip_tags row", () => {
  const src = readFileSync("lib/claude/classify-clip.ts", "utf8");
  assert.equal(
    /\.delete\(|\.remove\(/.test(src),
    false,
    "a deleted application is a reading that was really taken"
  );
});

test("the classifier sees the whole vocabulary", () => {
  const src = readFileSync("lib/claude/classify-clip.ts", "utf8");
  assert.equal(
    src.includes('.not("published_at", "is", null)'),
    false,
    "the freeze is on figures, not on the taxonomy"
  );
  assert.match(src, /\.neq\(\s*"group",\s*"format_motion"\s*\)/);
});

test("the prompt derives its axis list instead of hardcoding it", () => {
  const src = readFileSync("lib/claude/classify-clip.ts", "utf8");
  assert.equal(
    /faceted system across (five|six|seven|eight) axes/.test(src),
    false,
    "axis count must follow the loaded taxonomy"
  );
  assert.match(src, /faceted system across \$\{axisCount\} axes/);
  assert.match(src, /never force a weak match/);
});

test("every velocity denominator is summed over published rows only", () => {
  // The single most dangerous line in the product: swapping publishedTags
  // for allTags in any of these reduces readmits the whole incubating
  // vocabulary into the denominator, invisibly.
  for (const f of ["app/page.tsx", "app/trend/[name]/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /publishedTags\s*=\s*allTags\.filter\(\(t\) => t\.is_published\)/, f);
    assert.equal(
      /(base|recent)TotalRefs\s*=\s*allTags\.reduce/.test(src),
      false,
      `${f} must not sum a denominator over allTags`
    );
    assert.match(src, /baseTotalRefs\s*=\s*publishedTags\.reduce/, f);
  }
  const curator = readFileSync("app/curator/[name]/page.tsx", "utf8");
  assert.match(curator, /theirPublished\s*=\s*tagStats\.filter\(\(t\) => t\.is_published\)/);
  assert.match(curator, /theirBaseRefs\s*=\s*theirPublished\.reduce/);
});

test("no surface reads the tags table directly to build a list", () => {
  const offenders = walk("app").filter((f) =>
    readFileSync(f, "utf8").includes('.from("tags")')
  );
  assert.deepEqual(
    offenders,
    ["app/trend/[name]/page.tsx"],
    "that one is a single-row lookup by id; anything else needs review"
  );
});

test("the removed /taxonomy route is really gone", () => {
  const routes = walk("app").filter((f) => f.includes("/taxonomy/"));
  assert.deepEqual(routes, []);
});

test("the documented opening date is recorded", () => {
  assert.equal(NEW_VOCABULARY_OPENED, "2026-09-08");
});


// ---------------------------------------------------------------------
// The board-moving classifier is reachable from exactly one place.
//
// classifyAndTagClip writes EVERY tag the model returns, published ones
// included. On a brand-new clip that is correct — that is how a clip
// enters the library. Wired to a button that reprocesses EXISTING clips
// it would add published applications timestamped now, inside the
// trailing window, and swamp a board whose whole range is ±2.5 points.
// ---------------------------------------------------------------------

const FULL_CLASSIFIER = /\bclassifyAndTagClip(?![A-Za-z])/;

test("only the create flow calls the full classifier", () => {
  const callers = walk("app").filter((f) =>
    FULL_CLASSIFIER.test(readFileSync(f, "utf8"))
  );
  assert.deepEqual(
    callers,
    ["app/clip/actions.ts"],
    "reprocessing an existing clip must use classifyAndTagClipIncubatingOnly"
  );
});

test("the reclassify button applies incubating tags only", () => {
  const src = readFileSync("app/clip/reclassify-actions.ts", "utf8");
  assert.match(src, /classifyAndTagClipIncubatingOnly/);
  assert.equal(FULL_CLASSIFIER.test(src), false);
  assert.match(src, /getClipsMissingIncubatingTags/);
});

test("the first clip is classified in the request, not the background", () => {
  // A background job that cannot report its own failure reported
  // "Started — 20 clips processing" for 25 minutes while the Anthropic
  // API rejected every call and nothing was written. The probe is what
  // puts the real error on screen.
  const src = readFileSync("app/clip/reclassify-actions.ts", "utf8");
  const probeIndex = src.indexOf("const [probe, ...rest] = targets");
  const afterIndex = src.indexOf("after(async ()");
  assert.ok(probeIndex > 0, "the batch must classify a probe clip first");
  assert.ok(
    afterIndex > probeIndex,
    "the probe must run before anything is handed to after()"
  );
  assert.match(src, /return \{ error: `Classifier failed on the first clip/);
});
