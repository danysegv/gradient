import { test } from "node:test";
import assert from "node:assert/strict";
import { rankClips, type FeedClip } from "./feed-order.ts";

type TestClip = FeedClip & { id: string };

function clip(
  id: string,
  clipped_at: string,
  tags: { tag_id: string; confidence: number }[]
): TestClip {
  return { id, clipped_at, tags };
}

test("an empty map returns the input order unchanged (pre-09-26 / panel-withheld)", () => {
  // "Unchanged" holds because the input already arrives clipped_at
  // descending, same as app/page.tsx's query — an empty map makes every
  // clip unscored, so every comparison falls through to that same date
  // order, which is already what's given.
  const clips = [
    clip("a", "2026-09-12", [{ tag_id: "t1", confidence: 0.9 }]),
    clip("b", "2026-09-11", [{ tag_id: "t2", confidence: 0.9 }]),
    clip("c", "2026-09-10", []),
  ];
  const ranked = rankClips(clips, new Map());
  assert.deepEqual(ranked.map((c) => c.id), ["a", "b", "c"]);
});

test("a cooling tag sorts below a rising one", () => {
  const velocities = new Map([
    ["rising", 12.5],
    ["cooling", -8.0],
  ]);
  const clips = [
    clip("cooler", "2026-09-01", [{ tag_id: "cooling", confidence: 0.9 }]),
    clip("riser", "2026-08-01", [{ tag_id: "rising", confidence: 0.9 }]),
  ];
  const ranked = rankClips(clips, velocities);
  // The riser sorts first despite being older — score beats date.
  assert.deepEqual(ranked.map((c) => c.id), ["riser", "cooler"]);
});

test("ties fall back to clipped_at descending, both within a score and in the unscored group", () => {
  const velocities = new Map([["tag", 5]]);
  const tied = [
    clip("older", "2026-09-01", [{ tag_id: "tag", confidence: 0.9 }]),
    clip("newer", "2026-09-05", [{ tag_id: "tag", confidence: 0.9 }]),
  ];
  assert.deepEqual(
    rankClips(tied, velocities).map((c) => c.id),
    ["newer", "older"]
  );

  const unscored = [
    clip("older-unscored", "2026-09-01", []),
    clip("newer-unscored", "2026-09-05", []),
  ];
  assert.deepEqual(
    rankClips(unscored, velocities).map((c) => c.id),
    ["newer-unscored", "older-unscored"]
  );
});

test("scored clips always sort ahead of unscored ones, regardless of date", () => {
  const velocities = new Map([["tag", 1]]);
  const clips = [
    clip("unscored-but-newer", "2026-09-20", []),
    clip("scored-but-older", "2026-01-01", [{ tag_id: "tag", confidence: 0.9 }]),
  ];
  assert.deepEqual(
    rankClips(clips, velocities).map((c) => c.id),
    ["scored-but-older", "unscored-but-newer"]
  );
});

test("a tag below 0.5 confidence never contributes a score", () => {
  const velocities = new Map([["tag", 99]]);
  const clips = [
    clip("low-confidence", "2026-01-01", [{ tag_id: "tag", confidence: 0.49 }]),
    clip("no-tags", "2026-09-01", []),
  ];
  // low-confidence has no eligible tag, so it's unscored too — falls back
  // to date, where it's older and sorts second.
  assert.deepEqual(
    rankClips(clips, velocities).map((c) => c.id),
    ["no-tags", "low-confidence"]
  );
});

test("a tag absent from the map contributes nothing, even at high confidence", () => {
  const velocities = new Map([["has-velocity", 3]]);
  const clips = [
    clip("only-unmapped-tag", "2026-01-01", [
      { tag_id: "incubating-or-withheld", confidence: 1 },
    ]),
    clip("has-mapped-tag", "2026-01-01", [
      { tag_id: "has-velocity", confidence: 0.5 },
    ]),
  ];
  const ranked = rankClips(clips, velocities);
  // Same date, but only one clip has a score at all.
  assert.deepEqual(ranked.map((c) => c.id), ["has-mapped-tag", "only-unmapped-tag"]);
});

test("the score comes from the highest-confidence eligible tag, not the highest velocity", () => {
  const velocities = new Map([
    ["low-conf-high-velocity", 50],
    ["high-conf-low-velocity", 1],
  ]);
  const withBothTags = clip("mixed", "2026-01-01", [
    { tag_id: "low-conf-high-velocity", confidence: 0.6 },
    { tag_id: "high-conf-low-velocity", confidence: 0.95 },
  ]);
  const reference = clip("reference", "2026-01-01", [
    { tag_id: "high-conf-low-velocity", confidence: 0.95 },
  ]);
  // Both should score identically (velocity 1, from the higher-confidence
  // tag) and therefore tie on date, landing in input order.
  assert.deepEqual(
    rankClips([withBothTags, reference], velocities).map((c) => c.id),
    ["mixed", "reference"]
  );
});

test("is stable: a genuine tie (same score, same date) keeps input order", () => {
  const velocities = new Map([["tag", 7]]);
  const clips = [
    clip("first", "2026-09-01", [{ tag_id: "tag", confidence: 0.9 }]),
    clip("second", "2026-09-01", [{ tag_id: "tag", confidence: 0.9 }]),
    clip("third", "2026-09-01", [{ tag_id: "tag", confidence: 0.9 }]),
  ];
  assert.deepEqual(
    rankClips(clips, velocities).map((c) => c.id),
    ["first", "second", "third"]
  );
});

test("is pure: neither the clips array nor its objects are mutated", () => {
  const clips = [
    clip("a", "2026-09-01", [{ tag_id: "tag", confidence: 0.9 }]),
    clip("b", "2026-09-05", [{ tag_id: "tag", confidence: 0.9 }]),
  ];
  const snapshot = JSON.parse(JSON.stringify(clips));
  rankClips(clips, new Map([["tag", 1]]));
  assert.deepEqual(clips, snapshot);
});
