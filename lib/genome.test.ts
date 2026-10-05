import { test } from "node:test";
import assert from "node:assert/strict";
import { companionsOf, defaultLook, matrixOrder, oneWayCells, oneWays, type GenomeLook } from "./genome.ts";

const L = (id: string, total: number, early = false): GenomeLook => ({ id, name: id, group: "x", total, early });
const looks = new Map([
  ["a", L("a", 40)],
  ["b", L("b", 100)],
  ["c", L("c", 20)],
  ["d", L("d", 5, true)],
]);
const pairs = [
  { from: "a", to: "b", both: 36 }, { from: "b", to: "a", both: 36 },
  { from: "a", to: "c", both: 8 }, { from: "c", to: "a", both: 8 },
  { from: "a", to: "d", both: 5 }, { from: "d", to: "a", both: 5 },
  { from: "a", to: "a", both: 40 },
];

test("companions: share of the picked look, the reverse alongside, strongest first", () => {
  const c = companionsOf("a", looks, pairs);
  assert.deepEqual(c.map((x) => x.look.id), ["b", "c", "d"]);
  assert.equal(c[0].share, 0.9);
  assert.equal(c[0].back, 0.36);
  assert.equal(companionsOf("a", looks, pairs, 1).length, 1);
  assert.deepEqual(companionsOf("zzz", looks, pairs), []);
});

test("one-way pulls skip early looks and rank by the gap", () => {
  const o = oneWays(looks, pairs);
  assert.deepEqual(o.map((x) => `${x.from.id}>${x.to.id}`), ["a>b"]);
  assert.ok(Math.abs(o[0].share - o[0].back - 0.54) < 1e-9);
});

test("opens on the biggest look that can be trusted", () => {
  assert.equal(defaultLook([L("tiny", 300, true), L("big", 90), L("mid", 50)])?.id, "big");
  assert.equal(defaultLook([]), null);
});

test("the matrix runs axis by axis, densest first inside each", () => {
  const m = matrixOrder([
    { id: "t1", name: "t1", group: "typography", total: 5, early: false },
    { id: "m1", name: "m1", group: "movement", total: 3, early: false },
    { id: "m2", name: "m2", group: "movement", total: 9, early: false },
  ]);
  assert.deepEqual(m.map((x) => x.id), ["m2", "m1", "t1"]);
});

test("a notch only marks a pull at least 25 points one-sided", () => {
  assert.deepEqual([...oneWayCells(looks, pairs)], ["a|b"]);
});

test("incubating looks: last in their axis, never a one-way pull", () => {
  const I = (id: string, total: number, group: string, incubating = false): GenomeLook =>
    ({ id, name: id, group, total, early: false, incubating });
  const order = matrixOrder([I("big-new", 90, "movement", true), I("pub", 10, "movement"), I("typ", 50, "typography")]);
  assert.deepEqual(order.map((l) => l.id), ["pub", "big-new", "typ"]);
  const m = new Map([["p", I("p", 40, "x")], ["n", I("n", 100, "x", true)]]);
  const pr = [{ from: "p", to: "n", both: 36 }, { from: "n", to: "p", both: 36 }];
  assert.deepEqual(oneWays(m, pr), []);
  assert.equal(oneWayCells(m, pr).size, 0);
});
