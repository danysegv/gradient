import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDownloadRefusal,
  mediaTypeOf,
  robotsAllows,
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

test("media types the model takes", () => {
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
