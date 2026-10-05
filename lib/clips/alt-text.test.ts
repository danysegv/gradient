import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { ALT_MAX, altFromSummary, clipAlt } from "./alt-text.ts";

test("the first sentence, and only that", () => {
  assert.equal(
    altFromSummary("Oil painting on linen of a blue unicorn at a pool. Sparse fronds emerge from dust."),
    "Oil painting on linen of a blue unicorn at a pool."
  );
  assert.equal(altFromSummary("A poster with no full stop"), "A poster with no full stop");
});

test("numbers and grids don't end a sentence", () => {
  assert.equal(
    altFromSummary("A 2×2 grid of portraits at 1.5 scale. Each is shot on grey."),
    "A 2×2 grid of portraits at 1.5 scale."
  );
});

test("a long sentence is cut at a word, with an ellipsis", () => {
  const long = "A photograph " + "of a very detailed scene ".repeat(20) + "ending here.";
  const alt = altFromSummary(long)!;
  assert.ok(alt.length <= ALT_MAX + 1, `${alt.length}`);
  assert.ok(alt.endsWith("…"));
  assert.doesNotMatch(alt, /\s…$/);
});

test("nothing to say gives nothing, and the title stands in", () => {
  assert.equal(altFromSummary(null), null);
  assert.equal(altFromSummary("   "), null);
  assert.equal(clipAlt({ alt_text: "A red chair.", title: "Chair" }), "A red chair.");
  assert.equal(clipAlt({ alt_text: null, title: "Chair" }), "Chair");
  assert.equal(clipAlt({}), "");
});

// The regression this exists for: every clip image said alt="".
test("no clip image is marked decorative", () => {
  for (const f of ["components/clip-thumbnail.tsx", "components/intro/intro.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /alt=""/, `${f} hides a clip image from screen readers`);
  }
});

test("every grid query selects alt_text", () => {
  const files = [
    "app/page.tsx",
    "app/curators/page.tsx",
    "app/trend/[name]/page.tsx",
    "app/curator/[name]/page.tsx",
    "app/clip/[id]/page.tsx",
    "app/clip/page.tsx",
    "components/intro/intro-screen.tsx",
    "lib/boards/queries.ts",
    "lib/search/results.ts",
  ];
  for (const f of files) assert.match(readFileSync(f, "utf8"), /alt_text/, f);
});

test("every ClipThumbnail is given its alt", () => {
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".tsx") ? [`${d}/${e.name}`] : []
    );
  for (const f of [...walk("app"), ...walk("components")]) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<ClipThumbnail\b[\s\S]*?\/>/g)) {
      assert.match(m[0], /\balt=\{/, `${f}: a ClipThumbnail without alt`);
    }
  }
});
