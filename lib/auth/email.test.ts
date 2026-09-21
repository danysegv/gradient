import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmail } from "./email.ts";

test("an email is trimmed and lowercased", () => {
  assert.deepEqual(parseEmail("  Dany@Example.COM "), { ok: true, value: "dany@example.com" });
});

test("obvious typos are caught before anyone waits for an email", () => {
  for (const bad of ["", "   ", "dany", "dany@", "@example.com", "dany@example", "da ny@example.com", undefined]) {
    assert.equal(parseEmail(bad).ok, false, String(bad));
  }
});
