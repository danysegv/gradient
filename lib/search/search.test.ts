import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { normaliseQuery, orderByIds, QUERY_MAX } from "./query.ts";
import { normaliseDescription, KEYWORDS_MAX, SUMMARY_MAX } from "./describe-normalise.ts";

test("a query is trimmed, collapsed, capped, and empty when absent", () => {
  assert.equal(normaliseQuery("  film   photography "), "film photography");
  assert.equal(normaliseQuery(["package design", "x"]), "package design");
  assert.equal(normaliseQuery(undefined), "");
  assert.equal(normaliseQuery("   "), "");
  assert.equal(normaliseQuery("a".repeat(500)).length, QUERY_MAX);
});

test("rows come back in rank order, and unranked rows are dropped", () => {
  const rows = [{ id: "b" }, { id: "x" }, { id: "a" }, { id: "c" }];
  assert.deepEqual(orderByIds(rows, ["c", "a", "b"]).map((r) => r.id), ["c", "a", "b"]);
});

test("descriptions are cleaned before storage", () => {
  const d = normaliseDescription({
    summary: `  A   photograph ${"of a bottle ".repeat(80)}`,
    keywords: ["Film Photography", "film photography", "  35mm ", "", "x".repeat(60),
      ...Array.from({ length: 60 }, (_, i) => `term ${i}`)],
  });
  assert.ok(d.summary.length <= SUMMARY_MAX);
  assert.ok(d.summary.startsWith("A photograph of a bottle"));
  assert.deepEqual(d.keywords.slice(0, 2), ["film photography", "35mm"]);
  assert.equal(d.keywords.length, KEYWORDS_MAX);
});

// Decided 2026-09-11: Claude's image descriptions are for search only and
// are never shown. The database enforces it (no grants, and search_clips
// returns ids only); this keeps the app honest too. Only the describer may
// name the table, and it only writes.
test("only the describer names clip_descriptions, and it never selects from it", () => {
  const root = new URL("../../", import.meta.url);
  const hits: string[] = [];
  const walk = (dir: URL) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const url = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
      if (e.isDirectory()) walk(url);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        // A string literal naming the table — comments may mention it.
        if (/["'`]clip_descriptions["'`]/.test(readFileSync(url, "utf8"))) hits.push(url.pathname);
      }
    }
  };
  for (const d of ["app/", "components/", "lib/"]) walk(new URL(d, root));
  assert.deepEqual(
    hits.map((h) => h.slice(h.indexOf("/lib/") >= 0 ? h.indexOf("/lib/") : h.indexOf("/app/"))),
    ["/lib/claude/describe-clip.ts"]
  );
  const writer = readFileSync(new URL("lib/claude/describe-clip.ts", root), "utf8");
  assert.doesNotMatch(writer, /from\("clip_descriptions"\)\s*\.select/);
});
