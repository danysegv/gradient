import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planMove,
  byPositionThenNewest,
  POSITION_SPACING,
  MIN_POSITION_GAP,
  type OrderedClip,
} from "./position.ts";

// Applies a plan and returns the board as the user would see it, so every
// test asserts on the visible outcome rather than on the numbers written.
function orderAfter(
  rows: OrderedClip[],
  clipId: string,
  beforeId: string | null,
  afterId: string | null
): string {
  const writes = planMove(rows, clipId, beforeId, afterId);
  const byId = new Map(writes.map((w) => [w.clip_id, w.position]));
  return rows
    .map((r) => (byId.has(r.clip_id) ? { ...r, position: byId.get(r.clip_id)! } : r))
    .sort(byPositionThenNewest)
    .map((r) => r.clip_id)
    .join(" ");
}

const unarranged: OrderedClip[] = [
  { clip_id: "A", position: null, added_at: "2026-09-04" },
  { clip_id: "B", position: null, added_at: "2026-09-03" },
  { clip_id: "C", position: null, added_at: "2026-09-02" },
  { clip_id: "D", position: null, added_at: "2026-09-01" },
];

// A board only becomes arranged by being dragged, so the first drag always
// happens with every neighbour still null. These three used to land the clip
// at the front no matter where it was dropped.
test("first drag on a fresh board: into the middle", () => {
  assert.equal(orderAfter(unarranged, "D", "A", "B"), "A D B C");
});

test("first drag on a fresh board: to the very end", () => {
  assert.equal(orderAfter(unarranged, "D", "C", null), "A B C D");
});

test("first drag on a fresh board: to the front", () => {
  assert.equal(orderAfter(unarranged, "D", null, "A"), "D A B C");
});

const partial: OrderedClip[] = [
  { clip_id: "A", position: 1000, added_at: "2026-09-04" },
  { clip_id: "B", position: 2000, added_at: "2026-09-03" },
  { clip_id: "C", position: null, added_at: "2026-09-02" },
  { clip_id: "D", position: null, added_at: "2026-09-01" },
];

test("dragging into the still-unarranged tail", () => {
  assert.equal(orderAfter(partial, "A", "C", "D"), "B C A D");
});

test("dragging across the boundary between arranged and unarranged", () => {
  assert.equal(orderAfter(partial, "D", "B", "C"), "A B D C");
});

const arranged: OrderedClip[] = [
  { clip_id: "A", position: 1000, added_at: "2026-09-04" },
  { clip_id: "B", position: 2000, added_at: "2026-09-03" },
  { clip_id: "C", position: 3000, added_at: "2026-09-02" },
];

test("a fully arranged board writes exactly one row", () => {
  const writes = planMove(arranged, "C", "A", "B");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].clip_id, "C");
  assert.equal(writes[0].position, 1500);
  assert.equal(orderAfter(arranged, "C", "A", "B"), "A C B");
});

test("an unarranged board renumbers every row, once", () => {
  const writes = planMove(unarranged, "D", "A", "B");
  assert.equal(writes.length, 4);
  // and the result is arranged, so the next move is a single row again
  const now = unarranged.map((r) => {
    const w = writes.find((x) => x.clip_id === r.clip_id)!;
    return { ...r, position: w.position };
  });
  assert.equal(planMove(now, "C", null, "A").length, 1);
});

test("neighbours that have run out of room renumber instead of colliding", () => {
  const tight: OrderedClip[] = [
    { clip_id: "A", position: 1, added_at: "2026-09-03" },
    { clip_id: "B", position: 1 + MIN_POSITION_GAP / 2, added_at: "2026-09-02" },
    { clip_id: "C", position: 5, added_at: "2026-09-01" },
  ];
  const writes = planMove(tight, "C", "A", "B");
  assert.equal(writes.length, 3, "should renumber the whole board");
  assert.equal(orderAfter(tight, "C", "A", "B"), "A C B");
  const positions = writes.map((w) => w.position);
  assert.equal(new Set(positions).size, 3, "renumbered positions must be distinct");
});

test("a stale neighbour id degrades to an edge instead of writing nonsense", () => {
  assert.equal(orderAfter(arranged, "A", "does-not-exist", null), "B C A");
  assert.equal(orderAfter(arranged, "C", null, "does-not-exist"), "C A B");
});

test("moving a clip that isn't on the board writes nothing", () => {
  assert.deepEqual(planMove(arranged, "Z", "A", "B"), []);
});

test("planMove never mutates the rows it is given", () => {
  const snapshot = JSON.stringify(unarranged);
  planMove(unarranged, "D", "A", "B");
  assert.equal(JSON.stringify(unarranged), snapshot);
});

test("positions are spaced so an insert between two clips has room", () => {
  const writes = planMove(unarranged, "D", "A", "B");
  const sorted = writes.map((w) => w.position).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    assert.equal(sorted[i] - sorted[i - 1], POSITION_SPACING);
  }
});
