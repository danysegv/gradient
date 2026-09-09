import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  baselineStart,
  matchedBaselineVelocity,
  velocityFromCounts,
} from "./velocity.ts";

const LIBRARY_START = new Date("2026-08-10T00:00:00Z");
const AXIS_WIDENED = new Date("2026-11-11T00:00:00Z");

test("a tag as old as the library is unaffected by matched baseline", () => {
  // Its lifetime IS all time, so there is no debut artifact to correct.
  // Verified on live data: every tag first referenced 2026-08-10 shifts
  // by exactly 0.00 points.
  const locked = velocityFromCounts({
    baseRefs: 59,
    recentRefs: 60,
    baseTotalRefs: 454,
    recentTotalRefs: 225,
  });
  const matched = matchedBaselineVelocity({
    recentRefs: 60,
    recentTotalRefs: 225,
    baseRefsSinceBaseline: 59,
    baseTotalSinceBaseline: 454,
  });
  assert.equal(matched, locked);
});

test("the debut artifact is corrected, and can flip the sign", () => {
  // The LiquidGradients shape: a tag that arrived two weeks into the
  // library's life. All-time denominator says it is rising; its own
  // lifetime says it is falling.
  // These are LiquidGradients' real counts at the 09-26 window: 8
  // references, first seen 2026-08-24, two weeks into the library's life.
  // Live check gives locked +0.90 and matched −0.32.
  const locked = velocityFromCounts({
    baseRefs: 8,
    recentRefs: 6,
    baseTotalRefs: 454,
    recentTotalRefs: 225,
  });
  const matched = matchedBaselineVelocity({
    recentRefs: 6,
    recentTotalRefs: 225,
    baseRefsSinceBaseline: 8,
    // Only 267 published applications exist since it first appeared.
    baseTotalSinceBaseline: 267,
  });
  assert.ok(locked !== null && matched !== null);
  assert.ok(locked! > 0, "the locked metric calls it rising");
  assert.ok(matched! < 0, "its own lifetime says it is falling");
  assert.ok(
    Math.abs(locked! - matched!) * 100 > 1,
    `the correction must be material: got ${((locked! - matched!) * 100).toFixed(2)} pts`
  );
});

test("the correction grows with how late the tag arrived", () => {
  const shiftFor = (baseTotalSinceBaseline: number) => {
    const locked = velocityFromCounts({
      baseRefs: 8,
      recentRefs: 8,
      baseTotalRefs: 454,
      recentTotalRefs: 225,
    })!;
    const matched = matchedBaselineVelocity({
      recentRefs: 8,
      recentTotalRefs: 225,
      baseRefsSinceBaseline: 8,
      baseTotalSinceBaseline,
    })!;
    return locked - matched;
  };
  // Later arrival = smaller lifetime denominator = larger correction.
  const early = shiftFor(430);
  const late = shiftFor(210);
  assert.ok(late > early, "a later debut needs a bigger correction");
  assert.ok(early > 0 && late > 0, "both corrections point the same way");
});

test("uniform application is still exactly 0 under a matched baseline", () => {
  // The property the whole metric rests on must survive the fix.
  assert.equal(
    matchedBaselineVelocity({
      recentRefs: 10,
      recentTotalRefs: 100,
      baseRefsSinceBaseline: 20,
      baseTotalSinceBaseline: 200,
    }),
    0
  );
});

// ---------------------------------------------------------------------
// 4.2 — the regime reset
// ---------------------------------------------------------------------

test("with no regime the baseline is the tag's own first reference", () => {
  assert.deepEqual(baselineStart(LIBRARY_START), LIBRARY_START);
  assert.deepEqual(baselineStart(LIBRARY_START, null), LIBRARY_START);
  assert.equal(baselineStart(null), null);
});

test("a widened axis moves an incumbent's baseline forward", () => {
  // RawAsymmetry has been there since the library began, but its axis
  // changes underneath it at graduation. Its baseline moves to that day —
  // this is the whole of the -24pt fix.
  assert.deepEqual(baselineStart(LIBRARY_START, AXIS_WIDENED), AXIS_WIDENED);
});

test("a tag newer than the reset keeps its own start", () => {
  // A tag that debuts after its axis was widened has no incumbent
  // artifact; taking the earlier regime date would hand it history it
  // was never present for.
  const later = new Date("2026-12-01T00:00:00Z");
  assert.deepEqual(baselineStart(later, AXIS_WIDENED), later);
});

test("baselineStart is max(), so neither fix can undo the other", () => {
  for (const [tag, regime, expected] of [
    ["2026-08-10", "2026-11-11", "2026-11-11"],
    ["2026-12-01", "2026-11-11", "2026-12-01"],
    ["2026-11-11", "2026-11-11", "2026-11-11"],
  ] as const) {
    assert.equal(
      baselineStart(new Date(`${tag}T00:00:00Z`), new Date(`${regime}T00:00:00Z`))!.toISOString(),
      new Date(`${expected}T00:00:00Z`).toISOString()
    );
  }
});

test("velocity is still defined in exactly one place", () => {
  // matchedBaselineVelocity must delegate. A second implementation of
  // recent − base is the bug this asserts against.
  const src = readFileSync("lib/velocity.ts", "utf8");
  const fn = src.slice(src.indexOf("export function matchedBaselineVelocity"));
  assert.match(fn, /return velocityFromCounts\(\{/);
  assert.equal(
    /recentRefs\s*\/\s*recentTotalRefs\s*-/.test(fn),
    false,
    "the subtraction belongs to velocityFromCounts alone"
  );
});
