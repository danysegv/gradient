import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseProfileInput,
  checkAvatar,
  avatarPath,
  DISPLAY_NAME_MAX,
  BIO_MAX,
  AVATAR_MAX_BYTES,
} from "./input.ts";

const form = (fields: Record<string, string>) => ({
  get: (k: string) => (k in fields ? fields[k] : null),
});

test("blank is absent, not an empty string", () => {
  // The pages fall back to the handle when display_name is null; "" would
  // render as a heading with no name in it.
  const p = parseProfileInput(form({ display_name: "   ", bio: "\n\n  " }));
  assert.equal(p.display_name, null);
  assert.equal(p.bio, null);
});

test("a missing field is absent rather than a crash", () => {
  const p = parseProfileInput(form({}));
  assert.deepEqual(p, { display_name: null, bio: null });
});

test("display name is collapsed and capped", () => {
  const p = parseProfileInput(form({ display_name: "  Daniela   Henriques  " }));
  assert.equal(p.display_name, "Daniela Henriques");
  const long = parseProfileInput(form({ display_name: "a".repeat(200) }));
  assert.equal(long.display_name!.length, DISPLAY_NAME_MAX);
});

test("a bio keeps its paragraphs but not its sprawl", () => {
  const p = parseProfileInput(
    form({ bio: "Designer  in  Lisbon.\n\n\n\nClips at 4am." })
  );
  assert.equal(p.bio, "Designer in Lisbon.\n\nClips at 4am.");
  const long = parseProfileInput(form({ bio: "b".repeat(1000) }));
  assert.equal(long.bio!.length, BIO_MAX);
});

test("an avatar must be an image the bucket accepts", () => {
  assert.equal(checkAvatar({ type: "image/png", size: 1000 }), null);
  assert.equal(checkAvatar({ type: "image/gif", size: 1000 }), "type");
  assert.equal(checkAvatar({ type: "application/pdf", size: 10 }), "type");
});

test("an oversized or absent file is caught before it reaches storage", () => {
  assert.equal(checkAvatar({ type: "image/jpeg", size: AVATAR_MAX_BYTES + 1 }), "size");
  assert.equal(checkAvatar({ type: "image/jpeg", size: 0 }), "missing");
  assert.equal(checkAvatar(null), "missing");
});

test("the path is keyed by curator, so uploading replaces rather than piles up", () => {
  assert.equal(avatarPath("danysegv", "image/png"), "danysegv.png");
  assert.equal(avatarPath("DanySegv", "image/jpeg"), "danysegv.jpg");
  assert.equal(avatarPath("luma", "image/webp"), "luma.webp");
  assert.equal(avatarPath("luma", "image/avif"), "luma.avif");
});

test("the extension comes from the MIME type, never the uploaded filename", () => {
  // A file called "portrait.svg" sent as image/png must not become an .svg
  // in a public bucket.
  assert.equal(avatarPath("igor", "image/png"), "igor.png");
  assert.ok(!avatarPath("igor", "image/png").includes("svg"));
});
