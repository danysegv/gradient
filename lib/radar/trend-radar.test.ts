import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_PUBLISHES_AT, WITHHELD_TAG_IDS } from "../publication.ts";
import { computeTrendRadar, radarQuadrant, type RadarTagInput } from "./trend-radar.ts";

const DAY = 86_400_000;
const AFTER = BOARD_PUBLISHES_AT + DAY;
const BEFORE = BOARD_PUBLISHES_AT - DAY;
const old = new Date(BOARD_PUBLISHES_AT - 60 * DAY).toISOString();
const fresh = new Date(BOARD_PUBLISHES_AT - 1 * DAY).toISOString();

const tag = (id: string, refs: number, recentRefs: number, over: Partial<RadarTagInput> = {}): RadarTagInput => ({
  id,
  name: id,
  group: "movement",
  refs,
  recentRefs,
  earliestReferenceAt: old,
  latestReferenceAt: fresh,
  isPublished: true,
  ...over,
});

// Four published looks, plenty of recent volume: A big and rising,
// B big and falling, C small and rising, D small and falling.
const LIB = [tag("A", 100, 70), tag("B", 100, 30), tag("C", 20, 20), tag("D", 20, 5)];

test("nothing is plotted before the board publishes", () => {
  const r = computeTrendRadar({ tags: LIB, panelSafe: true, frozenAxes: new Set(), now: BEFORE });
  assert.equal(r.open, false);
  assert.equal(r.points.length, 0);
  assert.deepEqual(new Set(r.waiting.map((w) => w.reason)), new Set(["Opens with the board"]));
});

test("after it publishes, the four quadrants read as defined", () => {
  const r = computeTrendRadar({ tags: LIB, panelSafe: true, frozenAxes: new Set(), now: AFTER });
  assert.equal(r.open, true);
  assert.equal(r.evenShare, 0.25);
  const q = Object.fromEntries(r.points.map((p) => [p.id, p.quadrant]));
  assert.deepEqual(q, { A: "leading", B: "established", C: "emerging", D: "receding" });
});

test("share and shift use the published denominator only", () => {
  const withIncubating = [...LIB, tag("X", 500, 400, { isPublished: false })];
  const a = computeTrendRadar({ tags: LIB, panelSafe: true, frozenAxes: new Set(), now: AFTER });
  const b = computeTrendRadar({ tags: withIncubating, panelSafe: true, frozenAxes: new Set(), now: AFTER });
  assert.deepEqual(a.points, b.points);
  assert.deepEqual(
    b.waiting.map((w) => [w.id, w.reason]),
    [["X", "Incubating"]]
  );
});

test("a withheld tag stays off the chart and says so", () => {
  const id = [...WITHHELD_TAG_IDS][0];
  const r = computeTrendRadar({
    tags: [...LIB, tag(id, 60, 30)],
    panelSafe: true,
    frozenAxes: new Set(),
    now: AFTER,
  });
  assert.ok(!r.points.some((p) => p.id === id));
  assert.equal(r.waiting.find((w) => w.id === id)?.reason, "Withheld");
});

test("panel drift withholds every point, labelled", () => {
  const r = computeTrendRadar({ tags: LIB, panelSafe: false, frozenAxes: new Set(), now: AFTER });
  assert.equal(r.points.length, 0);
  assert.ok(r.waiting.every((w) => w.reason === "Panel Skew"));
});

test("young and thin tags wait as Early Signal", () => {
  const r = computeTrendRadar({
    tags: [...LIB, tag("thin", 9, 9), tag("young", 30, 30, { earliestReferenceAt: fresh })],
    panelSafe: true,
    frozenAxes: new Set(),
    now: AFTER,
  });
  const reasons = Object.fromEntries(r.waiting.map((w) => [w.id, w.reason]));
  assert.equal(reasons.thin, "Early Signal");
  assert.equal(reasons.young, "Early Signal");
});

test("quadrant boundary: exactly the even split counts as large, zero shift as giving back", () => {
  assert.equal(radarQuadrant(0.25, 0.01, 0.25), "leading");
  assert.equal(radarQuadrant(0.25, 0, 0.25), "established");
  assert.equal(radarQuadrant(0.1, 0, 0.25), "receding");
});

// --- the weekly trail ------------------------------------------------

import { attachTrail } from "./trend-radar.ts";

test("last week is read against today's gate, so an open radar has a trail", () => {
  const WEEK = 7 * DAY;
  const now = BOARD_PUBLISHES_AT + 2 * DAY; // last week was before publication
  const current = computeTrendRadar({ tags: LIB, panelSafe: true, frozenAxes: new Set(), now });
  const weekAgo = computeTrendRadar({
    tags: [tag("A", 80, 40), tag("B", 90, 60), tag("C", 16, 16), tag("D", 18, 10)],
    panelSafe: true,
    frozenAxes: new Set(),
    now: now - WEEK,
    publicationNow: now,
  });
  assert.equal(weekAgo.points.length, 4);
  const w = attachTrail(current, weekAgo);
  assert.equal(w.hasTrail, true);
  assert.ok(w.points.every((p) => p.prior !== null));
});

test("a look not on last week's radar is new, never given a made-up position", () => {
  const current = computeTrendRadar({ tags: LIB, panelSafe: true, frozenAxes: new Set(), now: AFTER });
  const weekAgo = computeTrendRadar({
    tags: [tag("A", 100, 70), tag("B", 100, 30)],
    panelSafe: true,
    frozenAxes: new Set(),
    now: AFTER - 7 * DAY,
    publicationNow: AFTER,
  });
  const w = attachTrail(current, weekAgo);
  const prior = Object.fromEntries(w.points.map((p) => [p.id, p.prior]));
  assert.equal(prior.C, null);
  assert.equal(prior.D, null);
  assert.notEqual(prior.A, null);
});

test("crossings name the quadrant change; the biggest mover is the largest change in shift", () => {
  const current = computeTrendRadar({ tags: LIB, panelSafe: true, frozenAxes: new Set(), now: AFTER });
  // A week ago B was rising; today it is giving share back.
  const weekAgo = computeTrendRadar({
    tags: [tag("A", 100, 70), tag("B", 100, 90), tag("C", 20, 20), tag("D", 20, 5)],
    panelSafe: true,
    frozenAxes: new Set(),
    now: AFTER - 7 * DAY,
    publicationNow: AFTER,
  });
  const w = attachTrail(current, weekAgo);
  assert.deepEqual(
    w.crossings.find((c) => c.id === "B"),
    { id: "B", name: "B", from: "leading", to: "established" }
  );
  assert.equal(w.biggestMover?.id, "B");
});

test("no radar a week ago means no trail at all", () => {
  const current = computeTrendRadar({ tags: LIB, panelSafe: true, frozenAxes: new Set(), now: AFTER });
  const w = attachTrail(current, null);
  assert.equal(w.hasTrail, false);
  assert.equal(w.biggestMover, null);
  assert.deepEqual(w.crossings, []);
});

// --- the panel gate, closed: the balanced reading (2026-10-12) ------

test("gate closed with a balanced reading: every look plots, by the balanced shift", () => {
  // Balanced deliberately disagrees with pooled on every sign.
  const balanced = new Map([["A", -0.02], ["B", 0.03], ["C", -0.01], ["D", 0.01]]);
  const r = computeTrendRadar({ tags: LIB, panelSafe: false, balanced, frozenAxes: new Set(), now: AFTER });
  assert.equal(r.reading, "balanced");
  assert.equal(r.points.length, 4);
  const shift = Object.fromEntries(r.points.map((p) => [p.id, p.shift]));
  assert.deepEqual(shift, { A: -0.02, B: 0.03, C: -0.01, D: 0.01 });
  // Share is still the library's, pooled: across is size, up is direction.
  const q = Object.fromEntries(r.points.map((p) => [p.id, p.quadrant]));
  assert.deepEqual(q, { A: "established", B: "leading", C: "receding", D: "emerging" });
});

test("gate open: the balanced reading is ignored, pooled publishes", () => {
  const balanced = new Map([["A", -0.5], ["B", -0.5], ["C", -0.5], ["D", -0.5]]);
  const a = computeTrendRadar({ tags: LIB, panelSafe: true, frozenAxes: new Set(), now: AFTER });
  const b = computeTrendRadar({ tags: LIB, panelSafe: true, balanced, frozenAxes: new Set(), now: AFTER });
  assert.equal(b.reading, "pooled");
  assert.deepEqual(a.points, b.points);
});

test("gate closed and no panel to balance: withheld, as before", () => {
  const allNull = new Map([["A", null], ["B", null], ["C", null], ["D", null]]);
  for (const balanced of [null, allNull]) {
    const r = computeTrendRadar({ tags: LIB, panelSafe: false, balanced, frozenAxes: new Set(), now: AFTER });
    assert.equal(r.reading, "withheld");
    assert.equal(r.points.length, 0);
    assert.ok(r.waiting.every((w) => w.reason === "Panel Skew"));
  }
});

test("the balanced reading never lets an incubating or young look through", () => {
  const balanced = new Map([["A", 0.01], ["B", 0.01], ["C", 0.01], ["D", 0.01], ["X", 0.2], ["young", 0.2]]);
  const r = computeTrendRadar({
    tags: [...LIB, tag("X", 50, 40, { isPublished: false }), tag("young", 30, 30, { earliestReferenceAt: fresh })],
    panelSafe: false,
    balanced,
    frozenAxes: new Set(),
    now: AFTER,
  });
  const reasons = Object.fromEntries(r.waiting.map((w) => [w.id, w.reason]));
  assert.equal(reasons.X, "Incubating");
  assert.equal(reasons.young, "Early Signal");
  assert.ok(!r.points.some((p) => p.id === "X" || p.id === "young"));
});

test("no trail across a change of reading: a change of method is not a move", () => {
  const balanced = new Map([["A", 0.01], ["B", 0.01], ["C", 0.01], ["D", 0.01]]);
  const current = computeTrendRadar({ tags: LIB, panelSafe: false, balanced, frozenAxes: new Set(), now: AFTER });
  const weekAgo = computeTrendRadar({
    tags: LIB,
    panelSafe: true,
    frozenAxes: new Set(),
    now: AFTER - 7 * DAY,
    publicationNow: AFTER,
  });
  assert.equal(weekAgo.points.length, 4);
  const w = attachTrail(current, weekAgo);
  assert.equal(w.hasTrail, false);
  assert.ok(w.points.every((p) => p.prior === null));
});
