import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publishedVelocities,
  BOARD_PUBLISHES_AT,
  WITHHELD_TAG_IDS,
} from "./publication.ts";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

test("before BOARD_PUBLISHES_AT, the feed gets an empty map regardless of input", () => {
  const all = new Map([
    ["rising", 12.5],
    ["cooling", -8.0],
  ]);
  const result = publishedVelocities(all, BOARD_PUBLISHES_AT - ONE_DAY_MS);
  assert.deepEqual([...result], []);
});

test("at or after BOARD_PUBLISHES_AT, withheld ids are absent from the result", () => {
  const [withheldId] = WITHHELD_TAG_IDS;
  const all = new Map([
    [withheldId, 99],
    ["not-withheld", 5],
  ]);
  const result = publishedVelocities(all, BOARD_PUBLISHES_AT);
  assert.equal(result.has(withheldId), false);
  assert.equal(result.get("not-withheld"), 5);
});

test("a withheld tag at confidence 1.0 still can't score a clip, post-launch", () => {
  const [withheldId] = WITHHELD_TAG_IDS;
  const all = new Map([[withheldId, 99]]);
  const result = publishedVelocities(all, BOARD_PUBLISHES_AT + ONE_DAY_MS);
  assert.equal(result.has(withheldId), false);
  assert.equal(result.size, 0);
});

test("every withheld id is dropped, not just the first", () => {
  const all = new Map<string, number>(
    [...WITHHELD_TAG_IDS].map((id) => [id, 42])
  );
  all.set("safe", 7);
  const result = publishedVelocities(all, BOARD_PUBLISHES_AT);
  for (const id of WITHHELD_TAG_IDS) {
    assert.equal(result.has(id), false);
  }
  assert.equal(result.get("safe"), 7);
});
