import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCover, COVER_COUNT } from "./cover.ts";
import type { OrderedClip } from "./position.ts";

const clip = (id: string, position: number | null, added_at: string) => ({
  clip_id: id,
  position,
  added_at,
});

// Deliberately built so added_at order and board order DISAGREE: "old" was
// added first but dragged to the front. The cover has to follow the board.
const board: OrderedClip[] = [
  clip("old", 1000, "2026-01-01"),
  clip("newest", 2000, "2026-09-12"),
  clip("mid", 3000, "2026-05-01"),
  clip("older", 4000, "2026-02-01"),
  clip("spare", 5000, "2026-06-01"),
];

const ids = (cs: { clip_id: string }[]) => cs.map((c) => c.clip_id).join(" ");

test("default cover is the first four in board order, not the four newest", () => {
  assert.equal(ids(resolveCover(board, null)), "old newest mid older");
});

test("rearranging the board rearranges the cover, with nothing stored", () => {
  const moved = board.map((c) =>
    c.clip_id === "spare" ? { ...c, position: 0 } : c
  );
  assert.equal(ids(resolveCover(moved, null)), "spare old newest mid");
});

test("unarranged boards fall back to newest-first", () => {
  const fresh = board.map((c) => ({ ...c, position: null }));
  assert.equal(ids(resolveCover(fresh, null)), "newest spare mid older");
});

test("a chosen cover is used in the order chosen", () => {
  assert.equal(
    ids(resolveCover(board, ["mid", "spare", "old", "newest"])),
    "mid spare old newest"
  );
});

test("a chosen clip that left the board is skipped, not left as a hole", () => {
  const cover = resolveCover(board, ["mid", "gone-from-board", "spare"]);
  assert.equal(cover.length, COVER_COUNT);
  assert.equal(ids(cover), "mid spare old newest");
});

test("a short choice is topped up from board order, never shrinks", () => {
  assert.equal(ids(resolveCover(board, ["spare"])), "spare old newest mid");
});

test("a duplicated choice doesn't consume two slots", () => {
  assert.equal(ids(resolveCover(board, ["mid", "mid"])), "mid old newest older");
});

test("a board smaller than the cover grid returns what it has", () => {
  assert.equal(ids(resolveCover(board.slice(0, 2), null)), "old newest");
  assert.deepEqual(resolveCover([], null), []);
});

test("an empty choice behaves as default, not as an empty cover", () => {
  assert.equal(ids(resolveCover(board, [])), "old newest mid older");
});

test("resolveCover never mutates its input", () => {
  const snapshot = JSON.stringify(board);
  resolveCover(board, ["spare"]);
  assert.equal(JSON.stringify(board), snapshot);
});
