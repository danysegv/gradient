import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifierSeesFrozenTags,
  NEW_VOCABULARY_OPENS,
} from "./taxonomy-freeze.ts";
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
