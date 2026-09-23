import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClipInput, isPublicWebUrl } from "./clip-input.ts";

const from = (o: Record<string, unknown>) => (k: string) => o[k];
const NOW = new Date("2026-09-23T12:00:00Z");

test("a page address and an image address are all a clip needs", () => {
  const r = parseClipInput(from({ url: " https://example.com/work ", image_url: "https://cdn.example.com/a.jpg" }), NOW);
  assert.deepEqual(r, {
    ok: true,
    value: {
      url: "https://example.com/work",
      image_url: "https://cdn.example.com/a.jpg",
      title: null, caption: null, creator: null, rights_holder: null, found_via: null, source_year: null,
    },
  });
});

test("the /clip form's messages are unchanged", () => {
  assert.deepEqual(parseClipInput(from({}), NOW), { ok: false, error: "Enter a valid URL." });
  assert.deepEqual(parseClipInput(from({ url: "not a url" }), NOW), { ok: false, error: "Enter a valid URL." });
  assert.deepEqual(parseClipInput(from({ url: "https://a.com", image_url: "nope" }), NOW), { ok: false, error: "Image URL isn't valid." });
  assert.deepEqual(parseClipInput(from({ url: "https://a.com", source_year: "19x6" }), NOW), {
    ok: false, error: "Work year must be a whole number between 1400 and 2027.",
  });
});

test("link-only intake: no data:, blob:, file: or javascript: addresses", () => {
  // A data: or blob: image would mean 04AM storing a copy of the work
  // rather than pointing at it — §512(c), not §512(d).
  for (const image_url of ["data:image/png;base64,AAAA", "blob:https://site.com/1234", "BLOB:x"]) {
    const r = parseClipInput(from({ url: "https://a.com", image_url }), NOW);
    assert.equal(r.ok, false, image_url);
    assert.match((r as { error: string }).error, /public web address/);
  }
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "ftp://a.com/x"]) {
    assert.equal(parseClipInput(from({ url }), NOW).ok, false, url);
  }
  assert.equal(isPublicWebUrl("http://a.com"), true);
  assert.equal(isPublicWebUrl("https://a.com/" + "x".repeat(5000)), false);
});

test("empty strings are nothing, words are trimmed, years accept numbers", () => {
  const r = parseClipInput(
    from({ url: "https://a.com", title: "  ", creator: " Pierre Mendell ", source_year: 1976 }),
    NOW
  );
  assert.ok(r.ok);
  assert.equal(r.value.title, null);
  assert.equal(r.value.creator, "Pierre Mendell");
  assert.equal(r.value.source_year, 1976);
});

test("non-string values from JSON are ignored, not coerced", () => {
  const r = parseClipInput(from({ url: "https://a.com", title: 42, creator: { x: 1 }, image_url: 7 }), NOW);
  assert.ok(r.ok);
  assert.equal(r.value.title, null);
  assert.equal(r.value.creator, null);
  assert.equal(r.value.image_url, null);
});

test("an absurdly long field is refused by name", () => {
  const r = parseClipInput(from({ url: "https://a.com", creator: "x".repeat(501) }), NOW);
  assert.deepEqual(r, { ok: false, error: "Creator is too long." });
});
