import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProfileInput, BIO_MAX } from "./input.ts";

const form = (fields: Record<string, string>) => ({
  get: (k: string) => (k in fields ? fields[k] : null),
});

test("blank is absent, not an empty string", () => {
  // The pages omit the bio when it is null; "" would leave a stray empty
  // paragraph under the curator's name.
  assert.equal(parseProfileInput(form({ bio: "   \n\n " })).bio, null);
});

test("a missing field is absent rather than a crash", () => {
  assert.deepEqual(parseProfileInput(form({})), { bio: null });
});

test("a bio keeps its paragraphs but not its sprawl", () => {
  assert.equal(
    parseProfileInput(form({ bio: "Designer  in  Lisbon.\n\n\n\nClips at 4am." })).bio,
    "Designer in Lisbon.\n\nClips at 4am."
  );
});

test("a bio is capped", () => {
  assert.equal(parseProfileInput(form({ bio: "b".repeat(1000) })).bio!.length, BIO_MAX);
});
