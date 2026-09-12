import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketOf,
  parseHex,
  toHsl,
  isColorBucket,
  COLOR_BUCKETS,
} from "./buckets.ts";

test("parses both hex forms, with or without the hash", () => {
  assert.deepEqual(parseHex("#fff"), [255, 255, 255]);
  assert.deepEqual(parseHex("000000"), [0, 0, 0]);
  assert.deepEqual(parseHex("  #C8352F  "), [200, 53, 47]);
  assert.equal(parseHex("nope"), null);
  assert.equal(parseHex("#12345"), null);
});

test("hsl round-trips the obvious cases", () => {
  assert.deepEqual(toHsl(255, 0, 0), [0, 1, 0.5]);
  const [, sGrey] = toHsl(128, 128, 128);
  assert.equal(sGrey, 0);
});

test("primary hues land where a person would put them", () => {
  assert.equal(bucketOf("#ff0000"), "red");
  assert.equal(bucketOf("#ff8000"), "orange");
  assert.equal(bucketOf("#ffe000"), "yellow");
  assert.equal(bucketOf("#00b050"), "green");
  assert.equal(bucketOf("#14b8a6"), "teal");
  assert.equal(bucketOf("#2563eb"), "blue");
  assert.equal(bucketOf("#7c3aed"), "violet");
  assert.equal(bucketOf("#ec4899"), "pink");
});

test("achromatic colours never take a hue", () => {
  assert.equal(bucketOf("#000000"), "black");
  assert.equal(bucketOf("#ffffff"), "white");
  assert.equal(bucketOf("#808080"), "grey");
  // A near-grey with a real hue angle: the angle is noise, not colour.
  assert.equal(bucketOf("#807d82"), "grey");
  assert.equal(bucketOf("#0a0b0a"), "black");
  // The bone colour: 2% chroma, but HSL calls it 24% saturated at hue 48.
  assert.equal(bucketOf("#f7f6f2"), "white");
  assert.equal(bucketOf("#fffdf5"), "white");
  assert.equal(bucketOf("#2b2a2e"), "black");
});

test("brown is recognised rather than filed as orange", () => {
  assert.equal(bucketOf("#7a5433"), "brown");
  assert.equal(bucketOf("#5c3a1e"), "brown");
  assert.equal(bucketOf("#8b6a45"), "brown");
  // but a bright saturated orange stays orange
  assert.equal(bucketOf("#ff8c1a"), "orange");
});

test("every bucket in the swatch row is reachable from some colour", () => {
  const reached = new Set(
    [
      "#ff0000", "#ff8c1a", "#ffe000", "#00b050", "#14b8a6", "#2563eb",
      "#7c3aed", "#ec4899", "#7a5433", "#000000", "#808080", "#ffffff",
    ].map(bucketOf)
  );
  for (const b of COLOR_BUCKETS) {
    assert.ok(reached.has(b.id), `nothing maps to ${b.id}`);
  }
});

test("unparseable input buckets to null rather than guessing", () => {
  assert.equal(bucketOf("rebeccapurple"), null);
  assert.equal(bucketOf(""), null);
});

test("isColorBucket guards what arrives from a URL", () => {
  assert.ok(isColorBucket("teal"));
  assert.ok(!isColorBucket("chartreuse"));
  assert.ok(!isColorBucket(undefined));
});
