import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isDownloadRefusal,
  isImageContentType,
  mediaTypeOf,
  robotsAllows,
  sniffImageType,
  checkImageReadable,
} from "./image-bytes.ts";

test("only a failed download is worth refetching ourselves", () => {
  assert.equal(
    isDownloadRefusal(new Error('400 {"message":"Unable to download the file."}')),
    true
  );
  // Fetched fine, the bytes are the problem — refetching changes nothing.
  assert.equal(isDownloadRefusal(new Error("could not process image")), false);
  // The host said no. That is an answer, not an obstacle.
  assert.equal(
    isDownloadRefusal(
      new Error("This URL is disallowed by the website's robots.txt file.")
    ),
    false
  );
  assert.equal(isDownloadRefusal(new Error("credit balance too low")), false);
});

test("anything the host calls an image is worth decoding", () => {
  // The first clip through this path was a .jpg.webp: served as an image,
  // rejected by the API until we re-encoded it.
  assert.equal(isImageContentType("image/webp"), true);
  assert.equal(isImageContentType("image/avif"), true);
  assert.equal(isImageContentType("IMAGE/JPEG"), true);
  assert.equal(isImageContentType("text/html; charset=utf-8"), false);
  assert.equal(isImageContentType(null), false);
});

test("media types the model takes as-is", () => {
  assert.equal(mediaTypeOf("image/jpeg"), "image/jpeg");
  assert.equal(mediaTypeOf("image/jpg"), "image/jpeg");
  assert.equal(mediaTypeOf("image/png; charset=binary"), "image/png");
  assert.equal(mediaTypeOf("text/html"), null);
  assert.equal(mediaTypeOf(null), null);
});

test("robots.txt: the rules for everyone, longest match wins", () => {
  const txt = [
    "User-agent: Googlebot",
    "Disallow: /",
    "",
    "User-agent: *",
    "Disallow: /private",
    "Allow: /private/ok",
  ].join("\n");
  assert.equal(robotsAllows(txt, "/images/a.jpg"), true);
  assert.equal(robotsAllows(txt, "/private/a.jpg"), false);
  assert.equal(robotsAllows(txt, "/private/ok/a.jpg"), true);
  // A rule aimed at another agent is not ours to obey or to ignore.
  assert.equal(robotsAllows("User-agent: Googlebot\nDisallow: /", "/a.jpg"), true);
});

test("robots.txt: an empty Disallow allows everything", () => {
  assert.equal(robotsAllows("User-agent: *\nDisallow:", "/anything"), true);
  assert.equal(robotsAllows("", "/anything"), true);
  assert.equal(robotsAllows("# just a comment", "/anything"), true);
});

test("robots.txt: a blanket disallow is respected", () => {
  assert.equal(robotsAllows("User-agent: *\nDisallow: /", "/a.jpg"), false);
});

// classify-clip.ts is server-only (it pulls in the Anthropic and Supabase
// clients), so this reads the source the way the taxonomy-freeze tests do.
test("an unreadable file parks the clip instead of aborting the batch", () => {
  const src = readFileSync(
    new URL("../claude/classify-clip.ts", import.meta.url),
    "utf8"
  );
  const body = src.slice(src.indexOf("export function isUnreadableImageError"));
  assert.match(body, /file format is invalid or unsupported/);
});

test("the first bytes say what a file is, whatever the header claims", () => {
  const b = (...xs: number[]) => new Uint8Array([...xs, 0, 0, 0, 0, 0, 0, 0, 0]);
  const t = (s: string) => new TextEncoder().encode(s);
  assert.equal(sniffImageType(b(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffImageType(b(0x89, 0x50, 0x4e, 0x47)), "image/png");
  assert.equal(sniffImageType(t("GIF89a......")), "image/gif");
  assert.equal(sniffImageType(t("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffImageType(t("\0\0\0\x1cftypavif")), "image/avif");
  assert.equal(sniffImageType(t('<svg xmlns="http://www.w3.org/2000/svg">')), "image/svg+xml");
  // A bot-check page served as image/jpeg is not an image.
  assert.equal(sniffImageType(t("<!DOCTYPE html><html>")), null);
});

// The door check, against a stubbed host. Its one rule: refuse only when
// certain. The first version refused every clip once sharp broke.
async function door(respond: () => Response | Promise<Response>) {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => respond()) as typeof fetch;
  try {
    return await checkImageReadable("https://img.example/a.jpg", "https://example.com/p");
  } finally {
    globalThis.fetch = real;
  }
}

test("the door lets in a real image without decoding it", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const r = await door(() => new Response(jpeg, { headers: { "content-type": "image/jpeg" } }));
  assert.equal(r.readable, true);
  // Mislabelled but real still counts.
  const r2 = await door(() => new Response(jpeg, { headers: { "content-type": "application/octet-stream" } }));
  assert.equal(r2.readable, true);
});

test("the door refuses only what is certainly not there", async () => {
  assert.equal((await door(() => new Response("", { status: 404 }))).readable, false);
  assert.equal((await door(() => new Response("gone", { status: 410 }))).readable, false);
  assert.equal(
    (await door(() => new Response("<html>no</html>", { headers: { "content-type": "text/html" } }))).readable,
    false
  );
});

test("doubt lets the clip in", async () => {
  // Bot walls that refuse servers but serve browsers.
  assert.equal((await door(() => new Response("", { status: 403 }))).readable, true);
  assert.equal((await door(() => new Response("", { status: 503 }))).readable, true);
  // A network failure or timeout is ours, not the curator's.
  assert.equal((await door(() => { throw new TypeError("fetch failed"); })).readable, true);
});

test("the door never waits on sharp", () => {
  const src = readFileSync(new URL("./image-bytes.ts", import.meta.url), "utf8");
  const door = src.slice(src.indexOf("export async function checkImageReadable"));
  const body = door.slice(0, door.indexOf("\n}\n"));
  assert.doesNotMatch(body, /sharp|asJpeg|robotsFor/);
  const create = readFileSync(new URL("./create.ts", import.meta.url), "utf8");
  assert.match(create, /checkImageReadable/);
  assert.doesNotMatch(create, /fetchImageForClassifier/);
});
