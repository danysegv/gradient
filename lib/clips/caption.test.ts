import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canEditCaption, parseCaption, MAX_CAPTION } from "./caption.ts";

test("a caption is trimmed text; empty removes it; too long is refused", () => {
  assert.deepEqual(parseCaption("  poster for a gig \r\n "), { ok: true, value: "poster for a gig" });
  assert.deepEqual(parseCaption("   "), { ok: true, value: null });
  assert.deepEqual(parseCaption(null), { ok: true, value: null });
  assert.equal(parseCaption("x".repeat(MAX_CAPTION)).ok, true);
  assert.equal(parseCaption("x".repeat(MAX_CAPTION + 1)).ok, false);
  assert.equal(parseCaption(42).ok, false);
});

test("only the curator who clipped it, or an admin, may edit", () => {
  const vic = { name: "vicmarodin", isAdmin: false };
  assert.equal(canEditCaption(vic, "vicmarodin"), true);
  assert.equal(canEditCaption(vic, "danysegv"), false);
  assert.equal(canEditCaption(vic, null), false);
  assert.equal(canEditCaption({ name: "danysegv", isAdmin: true }, "lumalhaes"), true);
  assert.equal(canEditCaption(null, "vicmarodin"), false);
});

test("the server decides who may edit, and writes only the caption", () => {
  const src = readFileSync("app/clip/caption-actions.ts", "utf8");
  assert.match(src, /canEditCaption\(session, clip\.clipped_by_name/);
  assert.match(src, /\.update\(\{ caption: parsed\.value \}\)/);
  assert.doesNotMatch(src, /clip_tags/);
});

test("archiving and restoring are limited to your own clips unless admin", () => {
  const src = readFileSync("app/clip/archive-actions.ts", "utf8");
  assert.equal((src.match(/if \(!isAdmin\) q = q\.eq\("clipped_by_name", curatorName\)/g) ?? []).length, 2);
});
