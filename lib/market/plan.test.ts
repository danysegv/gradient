import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyAllowance, isRecent, matchAllowance, pickEvenly } from "./plan.ts";

test("the market is read up to the library's size, a run at a time", () => {
  const m = { marketUsdLast7Days: 0, marketWeeklyUsd: 7, balanceLeftUsd: 20, clipReserveUsd: 2, usdPerItem: 0.03 };
  assert.deepEqual(matchAllowance({ ...m, librarySize: 259, marketHave: 18 }), {
    items: 60,
    reason: "catching up to the library (241 to go)",
  });
  assert.equal(matchAllowance({ ...m, librarySize: 259, marketHave: 250 }).items, 9);
  assert.deepEqual(matchAllowance({ ...m, librarySize: 259, marketHave: 259 }), {
    items: 0,
    reason: "the same size as the library",
  });
  // The weekly cap and the clip reserve still win.
  assert.equal(matchAllowance({ ...m, librarySize: 259, marketHave: 0, marketUsdLast7Days: 6.7 }).items, 10);
  assert.equal(matchAllowance({ ...m, librarySize: 259, marketHave: 0, balanceLeftUsd: 2.3 }).items, 10);
  assert.equal(matchAllowance({ ...m, librarySize: 259, marketHave: 0, balanceLeftUsd: null }).items, 0);
});

test("only articles published in the last three months count", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  assert.equal(isRecent("2026-09-27T08:00:00Z", now), true);
  assert.equal(isRecent("2026-07-01T00:00:00Z", now), true, "89 days");
  assert.equal(isRecent("2026-06-29T00:00:00Z", now), false, "91 days");
  assert.equal(isRecent("2024-05-01T00:00:00Z", now), false);
  assert.equal(isRecent(null, now), false, "undated can't prove it is recent");
  assert.equal(isRecent("not a date", now), false);
  assert.equal(isRecent("2026-10-15T00:00:00Z", now), false, "a future date is a broken feed");
});

const base = {
  weeklyItems: 140,
  readLast7Days: 0,
  marketUsdLast7Days: 0,
  marketWeeklyUsd: 7,
  balanceLeftUsd: 20,
  clipReserveUsd: 2,
  usdPerItem: 0.05,
};

test("a normal day reads a seventh of the week", () => {
  assert.deepEqual(dailyAllowance(base), { items: 20, reason: "daily share" });
});

test("the clip reserve wins over everything", () => {
  const a = dailyAllowance({ ...base, balanceLeftUsd: 2.3 });
  assert.equal(a.items, 6);
  assert.equal(a.reason, "holding the clip reserve");
  assert.equal(dailyAllowance({ ...base, balanceLeftUsd: 1.5 }).items, 0);
});

test("the weekly dollar cap and the weekly count both stop it", () => {
  assert.equal(dailyAllowance({ ...base, marketUsdLast7Days: 6.9 }).items, 2);
  assert.equal(dailyAllowance({ ...base, readLast7Days: 138 }).items, 2);
  assert.equal(dailyAllowance({ ...base, readLast7Days: 400 }).items, 0);
});

test("an unreadable ledger means no run, never an unmetered one", () => {
  assert.deepEqual(dailyAllowance({ ...base, balanceLeftUsd: null }), {
    items: 0,
    reason: "spend ledger unreadable",
  });
});

test("sources take turns; the prolific one does not dominate", () => {
  const c = (id: string, sourceId: string, day: number) => ({
    id, sourceId, discoveredAt: `2026-09-${10 + day}T00:00:00Z`, publishedAt: null,
  });
  const cands = [
    ...Array.from({ length: 10 }, (_, i) => c(`big${i}`, "big", i)),
    c("small1", "small", 1),
    c("small2", "small", 2),
  ];
  const picked = pickEvenly(cands, new Map([["big", 30], ["small", 2]]), 4);
  assert.deepEqual(picked.map((p) => p.id), ["small2", "big9", "small1", "big8"]);
  assert.equal(pickEvenly(cands, new Map(), 50).length, 12);
});
