import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertPublicUrl,
  BlockedAddressError,
  isInternalHostname,
  isPublicAddress,
  readBytesLimited,
  readTextLimited,
  safeFetch,
  setResolverForTests,
} from "./safe-fetch.ts";
import { isPublicWebUrl } from "../clips/clip-input.ts";

// Security review 2026-10-13, #6: the server never fetches an address
// inside a network on someone else's say-so.

test("public and internal addresses are told apart", () => {
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) assert.equal(isPublicAddress(ip), true, ip);
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "64:ff9b::a00:1",
  ]) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("172.32.0.1"), true); // just outside 172.16/12
});

test("hostnames that only mean 'inside' are refused without a lookup", () => {
  for (const h of ["localhost", "api.localhost", "printer.local", "db.internal", "metadata", "127.0.0.1", "[::1]", "169.254.169.254"]) {
    assert.equal(isInternalHostname(h), true, h);
  }
  for (const h of ["behance.net", "images.example.org", "93.184.216.34"]) assert.equal(isInternalHostname(h), false, h);
});

test("a clip can't be made from an internal address", () => {
  assert.equal(isPublicWebUrl("https://www.behance.net/gallery/1"), true);
  for (const u of ["http://localhost:3000/a.jpg", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/x.png", "http://[::1]/x"]) {
    assert.equal(isPublicWebUrl(u), false, u);
  }
});

test("a public name that resolves inside a network is refused", async () => {
  setResolverForTests(async (h) => (h === "sneaky.example.com" ? ["10.0.0.7"] : ["93.184.216.34"]));
  try {
    await assert.rejects(assertPublicUrl("https://sneaky.example.com/a.jpg"), BlockedAddressError);
    await assert.doesNotReject(assertPublicUrl("https://fine.example.com/a.jpg"));
    await assert.rejects(assertPublicUrl("file:///etc/passwd"), BlockedAddressError);
    await assert.rejects(assertPublicUrl("https://user:pw@fine.example.com/"), BlockedAddressError);
  } finally {
    setResolverForTests(null);
  }
});

test("a redirect into a network is refused at the hop, not followed", async () => {
  setResolverForTests(async () => ["93.184.216.34"]);
  const real = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    asked.push(String(input));
    if (String(input).includes("/start")) {
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    }
    return new Response("ok");
  }) as typeof fetch;
  try {
    await assert.rejects(safeFetch("https://public.example.com/start"), BlockedAddressError);
    assert.deepEqual(asked, ["https://public.example.com/start"]); // the metadata address was never fetched
  } finally {
    globalThis.fetch = real;
    setResolverForTests(null);
  }
});

test("public redirects are followed, within a limit", async () => {
  setResolverForTests(async () => ["93.184.216.34"]);
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const n = Number(new URL(String(input)).searchParams.get("n") ?? 0);
    return n < 3
      ? new Response(null, { status: 301, headers: { location: `/next?n=${n + 1}` } })
      : new Response("arrived");
  }) as typeof fetch;
  try {
    assert.equal(await (await safeFetch("https://a.example.com/next?n=0")).text(), "arrived");
    await assert.rejects(safeFetch("https://a.example.com/next?n=0", {}, { maxRedirects: 2 }), BlockedAddressError);
  } finally {
    globalThis.fetch = real;
    setResolverForTests(null);
  }
});

test("bodies are read only up to a ceiling", async () => {
  const big = new Response("x".repeat(5000));
  assert.equal((await readTextLimited(big, 100)).length, 100);
  assert.equal(await readBytesLimited(new Response("x".repeat(5000)), 100), null);
  assert.equal((await readBytesLimited(new Response("small"), 100))?.toString(), "small");
});

test("every server fetch of an outside address goes through safeFetch", () => {
  for (const f of ["lib/og-image.ts", "lib/clips/image-bytes.ts", "lib/claude/classify-clip.ts", "lib/market/compliance.ts", "lib/market/run.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /[^A-Za-z]fetch\(/, `${f} calls fetch() directly`);
  }
});
