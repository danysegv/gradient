import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifierSeesFrozenTags,
  NEW_VOCABULARY_OPENS,
  ADDITIVE_AXES,
  assertAdditiveAxes,
  fetchFrozenAxes,
} from "./taxonomy-freeze.ts";
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

// ---------------------------------------------------------------------
// A uniformly-applied new tag resolves to velocity 0.
// ---------------------------------------------------------------------

test("a uniformly-applied tag has velocity exactly 0", () => {
  // Same share inside the window as all-time: 5/50 recent, 10/100 base.
  const tagReferenceDates = [
    ...Array.from({ length: 5 }, () => daysAgo(10)),
    ...Array.from({ length: 5 }, () => daysAgo(60)),
  ];
  const allReferenceDates = [
    ...Array.from({ length: 50 }, () => daysAgo(10)),
    ...Array.from({ length: 50 }, () => daysAgo(60)),
  ];

  const v = computeTagVelocity({ tagReferenceDates, allReferenceDates, now: NOW });
  assert.equal(v, 0);
});

test("uniform application is 0 at any share of the library", () => {
  for (const share of [1, 5, 13, 25, 49]) {
    const tagReferenceDates = [
      ...Array.from({ length: share }, () => daysAgo(10)),
      ...Array.from({ length: share }, () => daysAgo(60)),
    ];
    const allReferenceDates = [
      ...Array.from({ length: 100 }, () => daysAgo(10)),
      ...Array.from({ length: 100 }, () => daysAgo(60)),
    ];
    assert.equal(
      computeTagVelocity({ tagReferenceDates, allReferenceDates, now: NOW }),
      0,
      `share ${share} should be flat`
    );
  }
});

// ---------------------------------------------------------------------
// A frozen tag is absent from every published DENOMINATOR.
//
// This is the whole trick of the incubation model, and the failure it
// guards is specific: filtering frozen tags out of the RESULT while
// leaving their clip_tags rows in the library-wide denominator. That
// looks like it works — the frozen tags don't appear — but every
// incumbent's share silently falls, which is the -24pt dilution the
// migration warns about arriving seven weeks early and inside a
// published number.
// ---------------------------------------------------------------------

const PUBLISHED = [
  ...apps("RawAsymmetry", 40, 60),
  ...apps("RawAsymmetry", 19, 10),
  ...apps("AnalogNoise", 38, 60),
  ...apps("AnalogNoise", 20, 10),
  ...apps("Poetcore", 10, 60),
  ...apps("Poetcore", 12, 10),
];

// What the classifier would have written had the freeze leaked: new
// layout tags taking applications inside the trailing window.
const FROZEN = [...apps("HardCrop", 15, 10), ...apps("EdgeAnchor", 12, 10)];
const FROZEN_IDS = new Set(["HardCrop", "EdgeAnchor"]);

test("frozen rows in the denominator move every published number", () => {
  const clean = computeVelocitiesForTags(PUBLISHED, NOW);
  const leaked = computeVelocitiesForTags([...PUBLISHED, ...FROZEN], NOW);

  // Guard the guard: if this ever stops differing, the fixture is inert
  // and the test below proves nothing.
  for (const tag of ["RawAsymmetry", "AnalogNoise", "Poetcore"]) {
    assert.notEqual(
      clean.get(tag),
      leaked.get(tag),
      `${tag} should be diluted when frozen rows stay in the denominator`
    );
  }

  // And the dilution is large, not a rounding artifact.
  const drop = (clean.get("RawAsymmetry") ?? 0) - (leaked.get("RawAsymmetry") ?? 0);
  assert.ok(
    drop * 100 > 3,
    `expected a multi-point drop, got ${(drop * 100).toFixed(2)} pts`
  );
});

test("excluding frozen rows from BOTH sides leaves published figures byte-identical", () => {
  const before = computeVelocitiesForTags(PUBLISHED, NOW);

  // The taxonomy expands: frozen tags exist and are being applied.
  const withFrozen = [...PUBLISHED, ...FROZEN];

  // What the RPCs must do — drop the rows, not just the output keys.
  const after = computeVelocitiesForTags(
    withFrozen.filter((r) => !FROZEN_IDS.has(r.tagId)),
    NOW
  );

  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [tag, v] of before) {
    assert.equal(after.get(tag), v, `${tag} must not move`);
  }
});

test("a frozen tag never appears in the published result at all", () => {
  const after = computeVelocitiesForTags(
    [...PUBLISHED, ...FROZEN].filter((r) => !FROZEN_IDS.has(r.tagId)),
    NOW
  );
  for (const id of FROZEN_IDS) assert.equal(after.has(id), false);
});

// ---------------------------------------------------------------------
// A frozen tag is absent from the CLASSIFIER'S TAXONOMY.
// ---------------------------------------------------------------------

test("the classifier does not see frozen tags unless explicitly opened", () => {
  const prev = process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS;
  try {
    for (const value of [undefined, "", "false", "TRUE", "1", "yes", " true"]) {
      if (value === undefined) delete process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS;
      else process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS = value;
      assert.equal(
        classifierSeesFrozenTags(),
        false,
        `${JSON.stringify(value)} must not open the vocabulary`
      );
    }
    process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS = "true";
    assert.equal(classifierSeesFrozenTags(), true);
  } finally {
    if (prev === undefined) delete process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS;
    else process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS = prev;
  }
});

test("the env flag is read per call, not cached at module load", () => {
  const prev = process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS;
  try {
    process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS = "true";
    assert.equal(classifierSeesFrozenTags(), true);
    process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS = "false";
    assert.equal(classifierSeesFrozenTags(), false);
  } finally {
    if (prev === undefined) delete process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS;
    else process.env.CLASSIFIER_INCLUDE_FROZEN_TAGS = prev;
  }
});

// The write-path filter itself can't be exercised without standing up
// Supabase, and it is the single most expensive line in the phase to lose
// silently — so assert it is present in the source. If the query is ever
// refactored, this fails loudly and a human decides, which is the point.
test("classify-clip.ts filters the taxonomy query on published_at", () => {
  const src = readFileSync("lib/claude/classify-clip.ts", "utf8");
  assert.match(src, /classifierSeesFrozenTags\(\)/);
  assert.match(src, /\.not\(\s*"published_at",\s*"is",\s*null\s*\)/);
  assert.match(src, /\.neq\(\s*"group",\s*"format_motion"\s*\)/);
});

test("the prompt derives its axis list instead of hardcoding it", () => {
  const src = readFileSync("lib/claude/classify-clip.ts", "utf8");
  assert.equal(
    /faceted system across (five|eight|six|seven) axes/.test(src),
    false,
    "axis count must not be a literal — it has to follow the loaded taxonomy"
  );
  assert.match(src, /faceted system across \$\{axisCount\} axes/);
  assert.match(src, /never force a weak match/);
});

test("the documented opening date has not drifted", () => {
  assert.equal(NEW_VOCABULARY_OPENS, "2026-09-27");
});


// ---------------------------------------------------------------------
// 1.7 — Cooling is suspended on an axis that carries frozen tags.
// ---------------------------------------------------------------------

const STALE = {
  referenceCount: 30,
  earliestReferenceAt: daysAgo(60),
  latestReferenceAt: daysAgo(COOLING_DAYS + 2),
  velocity: -0.02,
  now: NOW,
};

test("a stale tag still reads Cooling by default", () => {
  const c = getConfidence(STALE);
  assert.equal(c.cooling, true);
  assert.equal(c.coolingSuspended, false);
  assert.equal(c.label, "Cooling");
  assert.equal(c.velocity, null, "Cooling withholds the figure");
});

test("suspending Cooling on a widened axis withholds the false signal", () => {
  const c = getConfidence({ ...STALE, coolingSuspended: true });
  assert.equal(c.cooling, false);
  assert.equal(c.coolingSuspended, true);
  assert.notEqual(c.label, "Cooling");
  assert.equal(c.velocity, -0.02, "the tag is diverted, not dying");
});

test("suspension does not bypass the count band or the age gate", () => {
  // Thin: 3 references. Must stay Early Signal regardless.
  const thin = getConfidence({
    referenceCount: 3,
    earliestReferenceAt: daysAgo(90),
    latestReferenceAt: daysAgo(60),
    velocity: 0.05,
    coolingSuspended: true,
    now: NOW,
  });
  assert.equal(thin.band, "early-signal");
  assert.equal(thin.label, "Early Signal");
  assert.equal(thin.velocity, null);

  // Young: plenty of references, but the axis is 10 days old.
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

test("suspension changes nothing for a tag that is not stale", () => {
  const fresh = {
    referenceCount: 30,
    earliestReferenceAt: daysAgo(60),
    latestReferenceAt: daysAgo(2),
    velocity: 0.03,
    now: NOW,
  };
  const off = getConfidence(fresh);
  const on = getConfidence({ ...fresh, coolingSuspended: true });
  assert.equal(off.cooling, false);
  assert.equal(on.velocity, off.velocity);
  assert.equal(on.label, off.label);
});

// ---------------------------------------------------------------------
// 1.6 — only additive axes may be backfilled.
// ---------------------------------------------------------------------

test("only medium and subject are additive", () => {
  assert.deepEqual([...ADDITIVE_AXES], ["medium", "subject"]);
  assert.doesNotThrow(() => assertAdditiveAxes(["medium", "subject"]));
  assert.doesNotThrow(() => assertAdditiveAxes([]));
});

test("backfilling a single-select axis is refused", () => {
  for (const axis of [
    "layout",
    "movement",
    "typography",
    "palette_light",
    "treatment",
    "format_motion",
  ]) {
    assert.throws(
      () => assertAdditiveAxes([axis]),
      /Refusing to reclassify against non-additive axes/,
      `${axis} must be refused`
    );
  }
  // And it is refused even when smuggled in beside a legal one.
  assert.throws(() => assertAdditiveAxes(["medium", "layout"]), /layout/);
});

// ---------------------------------------------------------------------
// fetchFrozenAxes fails to today's behaviour, not to a blanket suspension.
// ---------------------------------------------------------------------

test("fetchFrozenAxes returns the axes carrying frozen tags", async () => {
  const client = {
    rpc: async () => ({
      data: [{ group: "layout", frozen_count: 5 }, { group: "medium", frozen_count: 8 }],
      error: null,
    }),
  };
  const axes = await fetchFrozenAxes(client);
  assert.equal(axes.has("layout"), true);
  assert.equal(axes.has("medium"), true);
  assert.equal(axes.has("movement"), false);
});

test("fetchFrozenAxes returns empty on error — no blanket suspension", async () => {
  const failing = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
  assert.equal((await fetchFrozenAxes(failing)).size, 0);

  const garbage = { rpc: async () => ({ data: { not: "an array" }, error: null }) };
  assert.equal((await fetchFrozenAxes(garbage)).size, 0);
});

test("clips_missing_axes is only ever called through the guard", () => {
  const src = readFileSync("lib/clips/unclassified.ts", "utf8");
  assert.match(src, /assertAdditiveAxes\(axes\)/);
  assert.match(src, /clips_missing_axes/);
});

test("the widened-taxonomy write path filters to the requested axes", () => {
  const src = readFileSync("lib/claude/classify-clip.ts", "utf8");
  assert.match(src, /classifications\.filter\(\(c\) => wanted\.has\(c\.group\)\)/);
});
