import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A clip that hasn't been classified yet — the queue hasn't run, or its
// image can't be fetched at all — is still a reference someone chose. It
// belongs in the feed and on its curator's page, with no trait chips.
// Both grids used to join clip_tags with !inner, which quietly hid 12
// clips (2026-09-23) from the library and from four profiles.
for (const page of ["../../app/page.tsx", "../../app/curator/[name]/page.tsx"]) {
  test(`${page} does not hide clips that have no tags yet`, () => {
    const src = readFileSync(new URL(page, import.meta.url), "utf8");
    assert.ok(!src.includes("clip_tags!inner"), "use a left join on clip_tags");
  });
}
