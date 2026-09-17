import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

// A clip whose honest answer is "nothing fits" must not be paid for again
// until the vocabulary changes. These pin the two halves of that together.

test("every successful classification in the queue runner records an attempt", () => {
  const src = readFileSync("app/clip/classify-actions.ts", "utf8");
  const classifies = src.match(/await classify\(clip\);/g) ?? [];
  const records = src.match(/await classify\(clip\);\s*\n\s*await recordClassificationAttempt\(clip\.id, clip\.mode\);/g) ?? [];
  assert.ok(classifies.length >= 2, "expected the probe and the batch loop");
  assert.equal(records.length, classifies.length, "a classify call without a recorded attempt re-queues the clip forever");
});

test("every file that runs the classifier over the queue records attempts", () => {
  // /clip renders the Process button, not Classify. The first version of
  // this fix only reached classify-actions.ts, so the button actually on
  // the page kept re-paying for the same clips. Find every caller rather
  // than trusting a list.
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = `${dir}/${f}`;
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
    });
  const callers = walk("app").filter((f) => {
    const src = readFileSync(f, "utf8");
    return /getClipsNeedingClassification/.test(src) && /classifyAndTagClip/.test(src);
  });
  assert.ok(callers.length >= 2, `expected classify-actions and process-actions, found ${callers}`);
  for (const f of callers) {
    const src = readFileSync(f, "utf8");
    // classify-actions.ts funnels both classifiers through a local
    // classify(clip); process-actions.ts calls them directly.
    const viaHelper = (src.match(/await classify\(clip\);/g) ?? []).length;
    const direct = (src.match(/classifyAndTagClip(IncubatingOnly)?\(input\)/g) ?? []).length;
    const calls = viaHelper > 0 ? viaHelper : direct;
    const records = (src.match(/await recordClassificationAttempt\(/g) ?? []).length;
    assert.ok(calls > 0, `${f}: no classify call found — has the call shape changed?`);
    assert.equal(records, calls, `${f}: ${calls} classify calls, ${records} recorded attempts`);
  }
});

test("an attempt is never recorded on failure", () => {
  const src = readFileSync("app/clip/classify-actions.ts", "utf8");
  for (const block of src.split("catch (err)").slice(1)) {
    const body = block.slice(0, block.indexOf("}\n"));
    assert.doesNotMatch(body, /recordClassificationAttempt/);
  }
});

test("the queue skips clips attempted since the vocabulary last changed", () => {
  const sql = readFileSync("scripts/classification-attempts.sql", "utf8");
  assert.match(sql, /greatest\(max\(created_at\), coalesce\(max\(published_at\)/);
  assert.match(sql, /a\.attempted_at > v\.changed_at/);
});
