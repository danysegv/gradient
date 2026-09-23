import { test } from "node:test";
import assert from "node:assert/strict";
import { corsHeaders, isExtensionOrigin } from "./cors.ts";

test("every browser's extension origin is answered", () => {
  for (const o of [
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop", // Chrome, Edge
    "moz-extension://3f1c2a4e-1b2c-4d5e-8f9a-0b1c2d3e4f5a", // Firefox
    "safari-web-extension://7A1B2C3D-4E5F-6071-8293-A4B5C6D7E8F9", // Safari
  ]) {
    assert.equal(isExtensionOrigin(o), true, o);
    assert.equal(corsHeaders(o)["Access-Control-Allow-Origin"], o);
  }
});

test("web pages are not", () => {
  for (const o of [null, "https://evil.example", "http://localhost:3000", "chrome-extension://a/b", "null"]) {
    assert.equal(isExtensionOrigin(o), false, String(o));
    assert.equal(corsHeaders(o)["Access-Control-Allow-Origin"], undefined);
  }
});

test("never cached, and never credentialed", () => {
  const h = corsHeaders("chrome-extension://abcdefghijklmnopabcdefghijklmnop");
  assert.equal(h["Cache-Control"], "no-store");
  assert.equal(h["Access-Control-Allow-Credentials"], undefined);
});
