import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_RADAR_MIN_CLIPS,
  computeBoardRadar,
  formatLean,
  quadrantOf,
  type RadarClipTag,
} from "./radar.ts";

const pub = (name: string, group = "movement", confidence = 0.9): RadarClipTag => ({
  name,
  group,
  confidence,
  isPublished: true,
});
const inc = (name: string, group = "medium"): RadarClipTag => ({
  name,
  group,
  confidence: 0.9,
  isPublished: false,
});

function board(size: number, make: (i: number) => RadarClipTag[]) {
  return Array.from({ length: size }, (_, i) => ({ tags: make(i) }));
}

const LIBRARY = {
  classifiedClips: 100,
  tags: [
    { name: "Poetcore", group: "movement", clips: 20 },
    { name: "RawAsymmetry", group: "layout", clips: 60 },
    { name: "Zinepunk", group: "movement", clips: 30 },
    { name: "Cyberpunk", group: "movement", clips: 5 },
  ],
};

test("board share divides by the board's tagged clips, not all its clips", () => {
  const clips = [
    ...board(12, (i) => (i < 6 ? [pub("Poetcore")] : [pub("Zinepunk")])),
    { tags: [] }, // unclassified: not in the denominator
  ];
  const r = computeBoardRadar(clips, LIBRARY);
  assert.equal(r.classifiedClips, 12);
  assert.equal(r.tags.find((t) => t.name === "Poetcore")!.boardShare, 0.5);
});

test("lean is board share minus library share, and sets the quadrant", () => {
  const r = computeBoardRadar(
    board(20, (i) => [
      inc("PhotoWork"), // every clip is tagged, so the denominator is 20
      ...(i < 12 ? [pub("Poetcore")] : []), // 60% vs 20% library
      ...(i < 10 ? [pub("RawAsymmetry", "layout")] : []), // 50% vs 60%
      ...(i < 3 ? [pub("Cyberpunk")] : []), // 15% vs 5%
      ...(i === 0 ? [pub("Zinepunk")] : []), // 5% vs 30%
    ]),
    LIBRARY
  );
  const get = (n: string) => r.tags.find((t) => t.name === n)!;
  assert.ok(Math.abs(get("Poetcore").lean! - 0.4) < 1e-9);
  assert.equal(get("Poetcore").quadrant, "signature");
  assert.equal(get("RawAsymmetry").quadrant, "foundation");
  assert.equal(get("Cyberpunk").quadrant, "accent");
  assert.equal(get("Zinepunk").quadrant, "background");
});

test("an incubating tag gets a board share and nothing library-wide", () => {
  const r = computeBoardRadar(
    board(BOARD_RADAR_MIN_CLIPS, (i) => [pub("Poetcore"), ...(i < 6 ? [inc("PhotoWork")] : [])]),
    LIBRARY
  );
  const t = r.tags.find((x) => x.name === "PhotoWork")!;
  assert.equal(t.boardShare, 0.5);
  assert.equal(t.libraryShare, null);
  assert.equal(t.lean, null);
  assert.equal(t.quadrant, null);
});

test("below the floor, shares are listed but no quadrant or absence is read", () => {
  const r = computeBoardRadar(board(BOARD_RADAR_MIN_CLIPS - 1, () => [pub("Poetcore")]), LIBRARY);
  assert.equal(r.readable, false);
  assert.equal(r.clipsToReadable, 1);
  assert.equal(r.tags[0].boardShare, 1);
  assert.equal(r.tags[0].quadrant, null);
  assert.deepEqual(r.absent, []);
});

test("low-confidence tags don't count, and a clip counts once per tag", () => {
  const r = computeBoardRadar(
    board(BOARD_RADAR_MIN_CLIPS, (i) =>
      i === 0 ? [pub("Poetcore"), pub("Poetcore")] : [pub("Poetcore", "movement", 0.3), pub("Zinepunk")]
    ),
    LIBRARY
  );
  assert.equal(r.tags.find((t) => t.name === "Poetcore")!.count, 1);
  for (const t of r.tags) assert.ok(t.boardShare <= 1);
});

test("notable absences are published tags common in the library and missing here", () => {
  const r = computeBoardRadar(board(BOARD_RADAR_MIN_CLIPS, () => [pub("Poetcore")]), LIBRARY);
  assert.deepEqual(
    r.absent.map((a) => a.name),
    ["RawAsymmetry", "Zinepunk"] // Cyberpunk at 5% is below the bar
  );
});

test("quadrant boundaries and formatting", () => {
  assert.equal(quadrantOf(0.25, 0.01), "signature");
  assert.equal(quadrantOf(0.25, 0), "foundation");
  assert.equal(quadrantOf(0.24, 0.5), "accent");
  assert.equal(formatLean(0.314), "+31");
  assert.equal(formatLean(-0.04), "−4");
  assert.equal(formatLean(0.001), "0");
});
