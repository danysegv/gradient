import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acceptsEffort, effortFor } from "./effort.ts";
import { DEFAULT_CLASSIFIER_MODEL } from "./classifier-config.ts";

test("haiku gets no effort parameter — it would 400", () => {
  assert.equal(acceptsEffort("claude-haiku-4-5"), false);
  assert.deepEqual(effortFor("claude-haiku-4-5", "low"), {});
});

test("the launch classifier still sends effort low, unchanged", () => {
  assert.deepEqual(effortFor(DEFAULT_CLASSIFIER_MODEL, "low"), { effort: "low" });
});

test("an unknown model gets no effort rather than a guess", () => {
  assert.equal(acceptsEffort("some-future-model"), false);
});

test("no call site hard-codes effort — it must go through effortFor", () => {
  for (const f of ["classify-clip.ts", "attribution-extract.ts", "describe-clip.ts"]) {
    const src = readFileSync(`lib/claude/${f}`, "utf8");
    assert.doesNotMatch(src, /^\s*effort:\s*"/m, `${f} sets effort directly`);
  }
});
