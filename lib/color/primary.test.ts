import { test } from "node:test";
import assert from "node:assert/strict";
import { primaryBucket, withPrimary, CHROMATIC_FLOOR } from "./primary.ts";
import type { ClipColor } from "./normalise.ts";

const c = (bucket: string, coverage: number): ClipColor =>
  ({ bucket, coverage, hex: "#000000" }) as ClipColor;

// The case the whole rule exists for.
test("a red poster on white files under red, not white", () => {
  assert.equal(
    primaryBucket([c("white", 0.7), c("red", 0.25), c("black", 0.05)]),
    "red"
  );
});

test("a genuinely neutral image files under its neutral", () => {
  assert.equal(primaryBucket([c("white", 0.6), c("grey", 0.3), c("black", 0.1)]), "white");
  assert.equal(primaryBucket([c("black", 0.8), c("grey", 0.2)]), "black");
});

test("a trace of colour does not define the image", () => {
  // a red button on a grey machine
  assert.equal(primaryBucket([c("grey", 0.9), c("red", 0.05)]), "grey");
});

test("the floor is exactly where it says it is", () => {
  assert.equal(primaryBucket([c("white", 0.8), c("red", CHROMATIC_FLOOR)]), "red");
  assert.equal(
    primaryBucket([c("white", 0.8), c("red", CHROMATIC_FLOOR - 0.001)]),
    "white"
  );
});

test("between two real hues the bigger one wins, whatever the neutrals do", () => {
  assert.equal(
    primaryBucket([c("white", 0.5), c("blue", 0.3), c("red", 0.2)]),
    "blue"
  );
});

test("brown counts as a hue, not a neutral", () => {
  assert.equal(primaryBucket([c("white", 0.6), c("brown", 0.4)]), "brown");
});

test("no colours means no primary, rather than a guess", () => {
  assert.equal(primaryBucket([]), null);
});

test("exactly one row is flagged, even if a bucket somehow repeats", () => {
  const rows = withPrimary([c("white", 0.7), c("red", 0.25), c("red", 0.05)]);
  assert.equal(rows.filter((r) => r.is_primary).length, 1);
  assert.equal(rows.find((r) => r.is_primary)!.bucket, "red");
  // the full breakdown survives: the rule can change without re-reading images
  assert.equal(rows.length, 3);
});

test("every row is kept so the rule stays tunable", () => {
  const rows = withPrimary([c("white", 0.9), c("teal", 0.1)]);
  assert.deepEqual(rows.map((r) => r.bucket), ["white", "teal"]);
  assert.equal(rows.filter((r) => r.is_primary).length, 1);
});
