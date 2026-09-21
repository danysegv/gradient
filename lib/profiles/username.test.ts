import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUsername, canRename, nextRenameAt, USERNAME_MAX } from "./username.ts";

test("a username is lowercased, not rejected, for case", () => {
  // Typing your own name with a capital is not a mistake worth a red line.
  assert.deepEqual(parseUsername("  DanySegv "), { ok: true, value: "danysegv" });
});

test("shape is enforced", () => {
  assert.equal(parseUsername("a").ok, false);
  assert.equal(parseUsername("x".repeat(USERNAME_MAX + 1)).ok, false);
  assert.equal(parseUsername("has space").ok, false);
  assert.equal(parseUsername("emoji🙂").ok, false);
  assert.equal(parseUsername("").ok, false);
  assert.equal(parseUsername(undefined).ok, false);
  assert.equal(parseUsername("lu.mal-haes_1").ok, true);
});

test("the cooldown is fourteen days from the last change", () => {
  const changed = "2026-09-20T12:00:00.000Z";
  assert.equal(nextRenameAt(changed)!.toISOString(), "2026-10-04T12:00:00.000Z");
  assert.equal(canRename(changed, new Date("2026-10-03T12:00:00.000Z")), false);
  assert.equal(canRename(changed, new Date("2026-10-04T12:00:00.000Z")), true);
});

test("a curator who has never renamed can rename now", () => {
  assert.equal(canRename(null, new Date()), true);
  assert.equal(nextRenameAt(null), null);
});
