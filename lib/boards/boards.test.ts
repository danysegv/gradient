import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { slugify, uniqueSlug, SLUG_MAX, SLUG_PATTERN } from "./slug.ts";
import { parseBoardInput, TITLE_MAX } from "./input.ts";

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

test("slugs satisfy the database check constraint", () => {
  for (const title of [
    "Spring campaign — Nike",
    "  ***  ",
    "Café Olé",
    "a".repeat(200),
    "Ends with dash -",
    "x-".repeat(40),
  ]) {
    const s = slugify(title);
    assert.match(s, SLUG_PATTERN, title);
    assert.ok(s.length <= SLUG_MAX, title);
  }
  assert.equal(slugify("Café Olé"), "cafe-ole");
  assert.equal(slugify("  ***  "), "board");
});

test("a taken slug gets the next free number and stays valid", () => {
  assert.equal(uniqueSlug("Moodboard", []), "moodboard");
  assert.equal(uniqueSlug("Moodboard", ["moodboard"]), "moodboard-2");
  assert.equal(uniqueSlug("Moodboard", ["moodboard", "moodboard-2"]), "moodboard-3");
  const long = "word-".repeat(20);
  const s = uniqueSlug(long, [slugify(long)]);
  assert.match(s, SLUG_PATTERN);
  assert.ok(s.length <= SLUG_MAX);
  assert.ok(s.endsWith("-2"));
});

test("board input is trimmed, bounded, and private unless ticked", () => {
  assert.deepEqual(parseBoardInput(form({ title: "  Brief  " })), {
    value: { title: "Brief", description: null, isPublic: false },
  });
  assert.deepEqual(parseBoardInput(form({ title: "B", description: " why ", is_public: "on" })), {
    value: { title: "B", description: "why", isPublic: true },
  });
  assert.ok("error" in parseBoardInput(form({ title: "   " })));
  assert.ok("error" in parseBoardInput(form({ title: "x".repeat(TITLE_MAX + 1) })));
});

// The rule the whole feature rests on: saving to a board must never create
// a clip or a tag application, so no figure can move. Enforced by keeping
// every board write path away from those tables.
test("board actions never write clips or clip_tags", () => {
  const src = readFileSync(new URL("../../app/boards/actions.ts", import.meta.url), "utf8");
  assert.ok(src.includes('from("boards")'));
  assert.doesNotMatch(src, /from\("clips"\)\s*\.(insert|upsert|update|delete)/);
  assert.doesNotMatch(src, /from\("clip_tags"\)/);
  assert.doesNotMatch(src, /classify/i);
});
