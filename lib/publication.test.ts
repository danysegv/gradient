import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("BOARD_PUBLISHES_AT is later than the last launch-cohort tag's age gate", () => {
  // Sciura is the last tag of the 09-26 launch cohort to clear the 45-day
  // age gate, at 2026-09-26T08:01:13Z. BOARD_PUBLISHES_AT must stay later
  // than that instant, or the feed could start ranking by a tag's velocity
  // before the board itself has published anything — the exact bug this
  // module exists to prevent, just with a smaller window to hide in.
  assert.ok(BOARD_PUBLISHES_AT > Date.parse("2026-09-26T08:01:13Z"));
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

test("the hold list lives in exactly one place", () => {
  // The board is written from scripts/panel-report.ts and the feed is ranked
  // by app/page.tsx. If either one names a tag id or re-implements the gate
  // instead of importing it, the two surfaces can disagree about what 04AM
  // has published — and the disagreement is invisible until launch morning,
  // when the board describes a tag the feed refuses to rank by.
  const sources = ["scripts/panel-report.ts", "app/page.tsx"];
  for (const f of sources) {
    const src = readFileSync(f, "utf8");
    assert.match(
      src,
      /from "(\.\.\/lib|@\/lib)\/publication(\.ts)?"/,
      `${f} must import the gate from lib/publication`
    );
    for (const id of WITHHELD_TAG_IDS) {
      assert.equal(
        src.includes(id),
        false,
        `${f} hardcodes the withheld id ${id} instead of importing the list`
      );
    }
  }
});

test("panel-report reproduces the feed's set by calling the feed's gates", () => {
  // Not by describing them. getConfidence decides eligibility and
  // publishedVelocities decides publishability; the script must call both,
  // in that order, or its "THE FEED RANKS BY" block is a guess.
  const src = readFileSync("scripts/panel-report.ts", "utf8");
  assert.match(src, /getConfidence\(/);
  assert.match(src, /publishedVelocities\(confident, NOW\.getTime\(\)\)/);
  assert.ok(
    src.indexOf("getConfidence(") < src.indexOf("publishedVelocities("),
    "confidence must be applied before publishability, as in app/page.tsx"
  );
});
