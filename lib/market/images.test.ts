import { test } from "node:test";
import assert from "node:assert/strict";
import { httpsImage, originImage } from "./images.ts";

test("a Photon CDN address is unwrapped to the publisher's own file", () => {
  assert.equal(
    originImage("https://i0.wp.com/packagingoftheworld.com/wp-content/uploads/2026/09/AERIS-Wine-t.jpg?fit=300%2C200&ssl=1"),
    "https://packagingoftheworld.com/wp-content/uploads/2026/09/AERIS-Wine-t.jpg"
  );
  assert.equal(
    originImage("http://i2.wp.com/www.example.org/a/b.png"),
    "https://www.example.org/a/b.png"
  );
});

test("anything else passes through untouched", () => {
  for (const u of [
    "https://bpando.org/wp-content/uploads/x.jpg",
    "https://wp.com/x.jpg",
    "https://i9.wp.com/site.com/x.jpg",
    "https://i0.wp.com/",
    "https://i0.wp.com/nohost/x.jpg",
    "not a url",
  ]) {
    assert.equal(originImage(u), u);
  }
});

test("http is upgraded, https left alone", () => {
  assert.equal(httpsImage("http://a.com/x.jpg"), "https://a.com/x.jpg");
  assert.equal(httpsImage("https://a.com/x.jpg"), "https://a.com/x.jpg");
});
