import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { currentSpendContext, withSpendContext } from "./spend-context.ts";

test("the context survives awaits and timers inside the call", async () => {
  const seen = await withSpendContext({ clipId: "a", kind: "describe" }, async () => {
    await new Promise((r) => setTimeout(r, 5));
    await Promise.resolve();
    return currentSpendContext();
  });
  assert.deepEqual(seen, { clipId: "a", kind: "describe" });
});

test("concurrent calls don't see each other's clip", async () => {
  const run = (id: string, ms: number) =>
    withSpendContext({ clipId: id, kind: "classify-full" }, async () => {
      await new Promise((r) => setTimeout(r, ms));
      return currentSpendContext()?.clipId;
    });
  assert.deepEqual(await Promise.all([run("x", 10), run("y", 1)]), ["x", "y"]);
});

test("nothing leaks out once the call returns", async () => {
  await withSpendContext({ clipId: "z", kind: "color" }, async () => {});
  assert.equal(currentSpendContext(), undefined);
});

test("the meter reads the context rather than labelling by model", () => {
  const src = readFileSync("lib/claude/admin.ts", "utf8");
  assert.match(src, /currentSpendContext\(\)/);
  assert.doesNotMatch(src, /kind: model, usage/);
});

test("every call into a paid Claude path runs inside a spend context", () => {
  // Found, not listed: a new caller that forgets the context gets NULL
  // clip ids again, silently. describe-clip.ts sets its own context.
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = `${dir}/${f}`;
      if (statSync(p).isDirectory()) return walk(p);
      return /\.tsx?$/.test(p) && !p.includes(".test.") ? [p] : [];
    });
  // A call, not a mention: the name followed directly by "(". Imports
  // destructure the name and comments don't call it.
  const paid = /\b(classifyAndTagClip|classifyAndTagClipIncubatingOnly|extractAttribution)\(/g;
  let checked = 0;
  for (const f of [...walk("app"), ...walk("scripts")]) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(paid)) {
      const lineStart = src.lastIndexOf("\n", m.index!) + 1;
      if (/^\s*(\/\/|\*)/.test(src.slice(lineStart, m.index))) continue;
      const before = src.slice(Math.max(0, m.index! - 220), m.index);
      assert.match(before, /withSpendContext\(/, `${f}: ${m[0]} is not inside withSpendContext`);
      checked++;
    }
  }
  assert.ok(checked >= 5, `expected at least 5 paid call sites, found ${checked}`);
});
