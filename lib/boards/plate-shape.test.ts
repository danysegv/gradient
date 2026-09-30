import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PLATE = "components/boards/board-card.tsx";

// Every plate on a profile is the same square, and it stays that way
// because its height comes from one place: the aspect-square grid, sized by
// the column it sits in.
//
// This was wrong twice before (09-25) and both times the cause was the
// same: the cover was allowed to grow to fill its row. A flexed cover takes
// the row's height, and the row is as tall as its tallest card — so one
// plate with a taller card anywhere in the row silently stretched its
// neighbours' covers and left the titles on different lines. These tests
// fail if any height on the cover becomes negotiable again.

const src = () => readFileSync(PLATE, "utf8");
const code = () =>
  src()
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

test("the plate cover is a square, and there is exactly one of them", () => {
  const squares = code().match(/aspect-square/g) ?? [];
  assert.equal(
    squares.length,
    1,
    "a plate's cover should be one aspect-square grid for every cover count — " +
      "more than one means the shape has branched again"
  );
});

test("nothing in a plate stretches to fill its row", () => {
  for (const grow of ["flex-1", "flex-grow", "h-full w-full object-cover\" + "]) {
    assert.equal(
      code().includes(grow),
      false,
      `${PLATE} uses "${grow}" — a cover that grows takes its height from the ` +
        "row instead of from its own width, which is how plates end up different sizes"
    );
  }
});

test("the cover markup does not branch its shape on how many covers there are", () => {
  // One clip or four, it is the same square; only which cells the tiles
  // occupy changes (spanFor). Testing whether there is anything to show at
  // all is fine — `covers.length > 0` picks the empty state, not a second
  // shape. A comparison against any other number is a second layout.
  const comparisons = code().match(/covers\.length\s*[><]=?\s*(\d+)/g) ?? [];
  const shapeBranches = comparisons.filter((m) => !/[><]=?\s*0$/.test(m));
  assert.deepEqual(
    shapeBranches,
    [],
    `${PLATE} branches its layout on how many covers it has — every plate is one shape`
  );
});
