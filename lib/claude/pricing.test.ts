import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { costOfUsage, PRICES, formatUsd } from "./pricing.ts";

const base = { input_tokens: 0, output_tokens: 0 };

test("plain input and output are priced at the model's rates", () => {
  const { usd, priced } = costOfUsage("claude-opus-5", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.equal(priced, true);
  assert.equal(usd, 30); // $5 in + $25 out
});

test("a cache WRITE costs more than plain input, not less", () => {
  // The trap this whole module exists to make visible: caching is not
  // free insurance. A 5-minute write bills at 1.25x, so a call that
  // writes the cache and never gets read is 25% WORSE than not caching.
  const uncached = costOfUsage("claude-opus-5", { ...base, input_tokens: 1_000_000 });
  const written = costOfUsage("claude-opus-5", {
    ...base,
    cache_creation_input_tokens: 1_000_000,
  });
  assert.ok(written.usd > uncached.usd);
  assert.equal(written.usd, 6.25);
});

test("a cache READ is a tenth of input", () => {
  const { usd } = costOfUsage("claude-opus-5", {
    ...base,
    cache_read_input_tokens: 1_000_000,
  });
  assert.equal(usd, 0.5);
});

test("a 1-hour cache write is priced at 2x when the SDK breaks it out", () => {
  const { usd } = costOfUsage("claude-opus-5", {
    ...base,
    cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
  });
  assert.equal(usd, 10);
});

test("with a breakdown present, the flat total is not double-counted", () => {
  // cache_creation_input_tokens is the SUM of the per-TTL fields. Adding
  // both would bill the same tokens twice.
  const { usd } = costOfUsage("claude-opus-5", {
    ...base,
    cache_creation_input_tokens: 1_000_000,
    cache_creation: { ephemeral_5m_input_tokens: 1_000_000 },
  });
  assert.equal(usd, 6.25);
});

test("an unpriced model records zero and says so", () => {
  const { usd, priced } = costOfUsage("claude-something-new", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.equal(usd, 0);
  assert.equal(priced, false);
});

test("every model this repo actually calls has a price", () => {
  // The tripwire. Switching CLASSIFIER_MODEL to something cheaper is the
  // plan; doing it without adding the price would make the ledger read $0
  // and the budget ceiling stop working, silently, in the direction that
  // costs money.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")
          ? [`${dir}/${e.name}`]
          : []
    );
  const named = new Set<string>();
  for (const f of [...walk("lib"), ...walk("app"), ...walk("scripts")]) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/["'](claude-[a-z0-9.-]+)["']/g)) named.add(m[1]);
  }
  assert.ok(named.size > 0, "no model names found — has the matcher drifted?");
  for (const model of named) {
    assert.ok(
      model in PRICES,
      `${model} is called somewhere in the repo but has no entry in PRICES`
    );
  }
});

test("sub-cent costs keep their digits", () => {
  // Every real call here is a fraction of a cent. Rounding to 2dp would
  // print $0.00 for all of them and the ledger would look empty.
  assert.equal(formatUsd(0.0006), "$0.00060");
  assert.equal(formatUsd(12.5), "$12.50");
  assert.equal(formatUsd(0), "$0");
});
