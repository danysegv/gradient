import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A clip whose honest answer is "nothing fits" must not be paid for again
// until the vocabulary changes. These pin the two halves of that together.

test("every successful classification in the queue runner records an attempt", () => {
  const src = readFileSync("app/clip/classify-actions.ts", "utf8");
  const classifies = src.match(/await classify\(clip\);/g) ?? [];
  const records = src.match(/await classify\(clip\);\s*\n\s*await recordClassificationAttempt\(clip\.id, clip\.mode\);/g) ?? [];
  assert.ok(classifies.length >= 2, "expected the probe and the batch loop");
  assert.equal(records.length, classifies.length, "a classify call without a recorded attempt re-queues the clip forever");
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
