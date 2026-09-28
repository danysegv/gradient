import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMarketOverlay, MARKET_FLOOR_ITEMS } from "./overlay.ts";

test("below the floor, nothing is drawn — only how far it has to go", () => {
  const o = computeMarketOverlay({
    marketCounts: new Map([["a", 5]]),
    itemsRead: MARKET_FLOOR_ITEMS - 1,
    libraryRecent: new Map([["a", 5]]),
  });
  assert.deepEqual(o, { open: false, itemsRead: MARKET_FLOOR_ITEMS - 1, floor: MARKET_FLOOR_ITEMS });
});

test("shares are of every published application, and gaps compare like with like", () => {
  const o = computeMarketOverlay({
    marketCounts: new Map([["a", 10], ["b", 30], ["c", 60]]),
    itemsRead: 200,
    libraryRecent: new Map([["a", 40], ["b", 30], ["c", 30]]),
  });
  assert.equal(o.open, true);
  if (!o.open) return;
  assert.equal(o.share.get("c"), 0.6);
  assert.deepEqual(o.ahead.map((g) => g.id), ["a"], "04AM holds a at 40%, the market at 10%");
  assert.deepEqual(o.behind.map((g) => g.id), ["c"]);
  assert.ok(Math.abs(o.ahead[0].gap - 0.3) < 1e-9);
});

test("a gap under two points is not news", () => {
  const o = computeMarketOverlay({
    marketCounts: new Map([["a", 50], ["b", 50]]),
    itemsRead: 500,
    libraryRecent: new Map([["a", 51], ["b", 49]]),
  });
  assert.equal(o.open && o.ahead.length + o.behind.length, 0);
});
