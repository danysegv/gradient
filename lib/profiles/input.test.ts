import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProfileInput, BIO_MAX, DISPLAY_NAME_MAX } from "./input.ts";

const form = (fields: Record<string, string>) => ({
  get: (k: string) => (k in fields ? fields[k] : null),
});

test("blank is absent, not an empty string", () => {
  // The pages omit the bio when it is null; "" would leave a stray empty
  // paragraph under the curator's name.
  assert.equal(parseProfileInput(form({ bio: "   \n\n " })).bio, null);
});

test("a missing field is absent rather than a crash", () => {
  assert.deepEqual(parseProfileInput(form({})), { displayName: null, bio: null });
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

test("a display name is one line, trimmed and capped", () => {
  // It is set as a heading, so a pasted line break can't be allowed to
  // survive into the markup.
  assert.equal(
    parseProfileInput(form({ display_name: "  Daniela\n Henriques  " })).displayName,
    "Daniela Henriques"
  );
  assert.equal(
    parseProfileInput(form({ display_name: "n".repeat(200) })).displayName!.length,
    DISPLAY_NAME_MAX
  );
});

test("no display name means the username stands alone", () => {
  assert.equal(parseProfileInput(form({ display_name: "   " })).displayName, null);
  assert.equal(parseProfileInput(form({})).displayName, null);
});
