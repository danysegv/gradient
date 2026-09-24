import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isClassified, onlyClassified } from "./visibility.ts";
import { PUBLIC_TAG_CONFIDENCE } from "../tag-confidence.ts";

// THIS REVERSES 2026-09-23. That day the grids stopped hiding clips with
// no tags: they had been dropped by a `clip_tags!inner` join, silently,
// and the argument was that a clip someone chose is a reference whether
// or not the queue has reached it.
//
// Daniela's call, 2026-09-24: on the public surfaces it isn't. 04AM's
// whole claim is that every image carries a reading; an image with no
// trait is a Pinterest tile. So the Signals feed, curator profiles and
// the curators strip show only classified clips, by default.
//
// What did NOT come back is the mechanism that made the old behaviour a
// bug. That join also hid the clips from the page's own knowledge of
// them, and it hid sub-0.5 readings inconsistently. This is an explicit,
// tested filter on the way to the screen, applied after the rows are
// loaded, so the page still knows what it is not showing.

test("a clip is classified once one reading clears the public line", () => {
  assert.equal(isClassified([{ confidence: PUBLIC_TAG_CONFIDENCE }]), true);
  assert.equal(isClassified([{ confidence: 0.9 }, { confidence: 0.1 }]), true);
});

test("no readings, or only quiet ones, is not classified", () => {
  assert.equal(isClassified([]), false);
  assert.equal(isClassified(null), false);
  assert.equal(isClassified(undefined), false);
  assert.equal(isClassified([{ confidence: null }]), false);
  // 0.2 guesses are exactly what the clipper shows dimmed and the site
  // never calls a trait.
  assert.equal(isClassified([{ confidence: 0.2 }, { confidence: 0.49 }]), false);
});

test("the line is the shared one, not a copy", () => {
  assert.equal(
    isClassified([{ confidence: PUBLIC_TAG_CONFIDENCE - 0.001 }]),
    false
  );
});

test("filtering keeps order and drops nothing else", () => {
  const clips = [
    { id: "a", tags: [{ confidence: 0.8 }] },
    { id: "b", tags: [] },
    { id: "c", tags: [{ confidence: 0.3 }] },
    { id: "d", tags: [{ confidence: 0.5 }] },
  ];
  assert.deepEqual(
    onlyClassified(clips, (c) => c.tags).map((c) => c.id),
    ["a", "d"]
  );
  // Pure: the input is untouched.
  assert.equal(clips.length, 4);
});

// The three public surfaces have to go through the shared filter. A page
// that fetches clips and renders them without it is the regression this
// file exists to catch — in either direction.
const SURFACES = [
  "app/page.tsx",
  "app/curator/[name]/page.tsx",
  "app/curators/page.tsx",
];

test("every public clip surface filters through the shared rule", () => {
  for (const page of SURFACES) {
    const src = readFileSync(page, "utf8");
    assert.match(
      src,
      /onlyClassified\(/,
      `${page} renders clips without the classified filter`
    );
  }
});

test("the filter is applied in the page, not by hiding rows in the query", () => {
  // The 2026-09-23 bug was an inner join: the page never saw the clips it
  // wasn't showing, so nothing could report or fix them. Keep the rows.
  for (const page of SURFACES) {
    const src = readFileSync(page, "utf8");
    assert.ok(
      !src.includes("clip_tags!inner"),
      `${page}: filter after loading, don't drop the rows in the query`
    );
  }
});
