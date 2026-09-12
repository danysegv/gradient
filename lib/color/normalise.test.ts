import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseColors } from "./normalise.ts";

test("several shades of one colour merge into one row", () => {
  const rows = normaliseColors([
    { hex: "#2563eb", coverage: 0.2 },
    { hex: "#1e40af", coverage: 0.15 },
    { hex: "#3b82f6", coverage: 0.05 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bucket, "blue");
  assert.ok(Math.abs(rows[0].coverage - 0.4) < 1e-9);
  // the hex kept is the biggest single contributor, not the first seen
  assert.equal(rows[0].hex, "#2563eb");
});

test("rows come back most-present first", () => {
  const rows = normaliseColors([
    { hex: "#000000", coverage: 0.1 },
    { hex: "#ff0000", coverage: 0.6 },
    { hex: "#ffffff", coverage: 0.3 },
  ]);
  assert.deepEqual(rows.map((r) => r.bucket), ["red", "white", "black"]);
});

test("coverages over one are scaled, not clipped, so order survives", () => {
  const rows = normaliseColors([
    { hex: "#ff0000", coverage: 0.9 },
    { hex: "#2563eb", coverage: 0.6 },
    { hex: "#000000", coverage: 0.3 },
  ]);
  const total = rows.reduce((s, r) => s + r.coverage, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `total was ${total}`);
  assert.deepEqual(rows.map((r) => r.bucket), ["red", "blue", "black"]);
  assert.ok(rows[0].coverage > rows[1].coverage);
});

test("coverages under one are left alone — they're estimates, not a partition", () => {
  const rows = normaliseColors([
    { hex: "#ff0000", coverage: 0.3 },
    { hex: "#000000", coverage: 0.2 },
  ]);
  assert.ok(Math.abs(rows[0].coverage - 0.3) < 1e-9);
  assert.ok(Math.abs(rows[1].coverage - 0.2) < 1e-9);
});

test("junk from the model is dropped, not stored", () => {
  const rows = normaliseColors([
    { hex: "rebeccapurple", coverage: 0.5 },
    { hex: "#ff0000", coverage: 0 },
    { hex: "#ff0000", coverage: -0.2 },
    { hex: "#00b050", coverage: Number.NaN },
    { hex: "#2563eb", coverage: 0.4 },
  ]);
  assert.deepEqual(rows.map((r) => r.bucket), ["blue"]);
});

test("a hex without its hash still stores with one", () => {
  const rows = normaliseColors([{ hex: "2563EB", coverage: 0.5 }]);
  assert.equal(rows[0].hex, "#2563eb");
});

test("an empty or all-junk list gives no rows rather than a fake one", () => {
  assert.deepEqual(normaliseColors([]), []);
  assert.deepEqual(normaliseColors([{ hex: "nope", coverage: 1 }]), []);
});
