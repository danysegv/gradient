import { test } from "node:test";
import assert from "node:assert/strict";
import { colorsFromPixels, MIN_PIXEL_SHARE, MAX_BUCKETS } from "./extract.ts";

/** n pixels of one colour, interleaved. */
const run = (n: number, [r, g, b]: number[], a?: number) =>
  Array.from({ length: n }, () => (a === undefined ? [r, g, b] : [r, g, b, a])).flat();

const RED = [255, 0, 0];
const BLUE = [37, 99, 235];
const BLACK = [0, 0, 0];

test("coverage is the share of pixels, not a guess", () => {
  const rows = colorsFromPixels([...run(75, RED), ...run(25, BLUE)]);
  assert.deepEqual(rows.map((r) => r.bucket), ["red", "blue"]);
  assert.ok(Math.abs(rows[0].coverage - 0.75) < 1e-9);
  assert.ok(Math.abs(rows[1].coverage - 0.25) < 1e-9);
});

test("shades of one colour land in one bucket and average to a representative hex", () => {
  const rows = colorsFromPixels([...run(50, [0, 0, 200]), ...run(50, [0, 0, 100])]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bucket, "blue");
  assert.equal(rows[0].coverage, 1);
  assert.equal(rows[0].hex, "#000096"); // the mean, not either sample
});

test("a speck of colour doesn't make the image that colour", () => {
  const rows = colorsFromPixels([...run(999, BLACK), ...run(1, RED)]);
  assert.deepEqual(rows.map((r) => r.bucket), ["black"]);
});

test("the floor is the documented one", () => {
  const under = colorsFromPixels([...run(1000, BLACK), ...run(9, RED)]);
  assert.deepEqual(under.map((r) => r.bucket), ["black"]);
  const over = colorsFromPixels([...run(1000, BLACK), ...run(50, RED)]);
  assert.ok(over.some((r) => r.bucket === "red"));
  assert.ok(MIN_PIXEL_SHARE > 0 && MIN_PIXEL_SHARE < 0.1);
});

test("fully transparent pixels are skipped, not read as black", () => {
  const rows = colorsFromPixels([...run(50, RED, 255), ...run(50, BLACK, 0)], 4);
  assert.deepEqual(rows.map((r) => r.bucket), ["red"]);
  assert.equal(rows[0].coverage, 1);
});

test("a transparent-only image yields nothing rather than a false black", () => {
  assert.deepEqual(colorsFromPixels(run(40, BLACK, 0), 4), []);
  assert.deepEqual(colorsFromPixels([]), []);
});

test("never returns more buckets than the cap, and they are ordered", () => {
  const many = [
    ...run(30, RED), ...run(25, BLUE), ...run(20, [0, 176, 80]),
    ...run(15, [20, 184, 166]), ...run(10, [124, 58, 237]),
    ...run(8, [236, 72, 153]), ...run(6, [216, 176, 44]),
  ];
  const rows = colorsFromPixels(many);
  assert.ok(rows.length <= MAX_BUCKETS);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].coverage >= rows[i].coverage);
  }
});

test("extraction agrees with search by construction: every bucket is a real one", () => {
  const rows = colorsFromPixels([...run(10, RED), ...run(10, [247, 246, 242])]);
  assert.deepEqual(rows.map((r) => r.bucket).sort(), ["red", "white"]);
});
