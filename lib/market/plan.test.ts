import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyAllowance, pickEvenly } from "./plan.ts";

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
