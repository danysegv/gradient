import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUrl, headerReservation, parseTdmRep, resetComplianceCache, tdmReserved } from "./compliance.ts";

test("TDMRep: the most specific location decides", () => {
  const rules = parseTdmRep([
    { location: "/*", "tdm-reservation": 0 },
    { location: "/photos/*", "tdm-reservation": 1 },
    { nonsense: true },
  ]);
  assert.equal(tdmReserved(rules, "/news/a"), false);
  assert.equal(tdmReserved(rules, "/photos/a.jpg"), true);
  assert.deepEqual(parseTdmRep("not an array"), []);
});

test("response headers can reserve", () => {
  assert.equal(headerReservation(new Headers({ "tdm-reservation": "1" })), "tdm-reservation header");
  assert.equal(headerReservation(new Headers({ "x-robots-tag": "noindex, noai" })), "X-Robots-Tag: noai");
  assert.equal(headerReservation(new Headers({ "x-robots-tag": "noimageai" })), "X-Robots-Tag: noimageai");
  assert.equal(headerReservation(new Headers({ "x-robots-tag": "noindex" })), null);
});

async function withHost(files: Record<string, Response | (() => never)>, fn: () => Promise<void>) {
  const real = globalThis.fetch;
  resetComplianceCache();
  globalThis.fetch = (async (input: string | URL) => {
    const path = new URL(String(input)).pathname;
    const f = files[path];
    if (!f) return new Response("", { status: 404 });
    if (typeof f === "function") f();
    return (f as Response).clone();
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
    resetComplianceCache();
  }
}

test("an open site is readable, with its crawl delay", async () => {
  await withHost({ "/robots.txt": new Response("User-agent: *\nCrawl-delay: 60\nDisallow: /wp-admin/") }, async () => {
    assert.deepEqual(await checkUrl("https://ex.com/feed/"), { ok: true, crawlDelay: 60 });
  });
});

test("a site barring any AI agent is not read, even when ours is allowed", async () => {
  await withHost({ "/robots.txt": new Response("User-agent: GPTBot\nDisallow: /") }, async () => {
    const v = await checkUrl("https://ex.com/feed/");
    assert.equal(v.ok, false);
    assert.match(!v.ok ? v.reason : "", /GPTBot/);
  });
});

test("a tdmrep.json reservation stops it", async () => {
  await withHost(
    {
      "/robots.txt": new Response(""),
      "/.well-known/tdmrep.json": new Response(JSON.stringify([{ location: "/*", "tdm-reservation": 1 }])),
    },
    async () => {
      assert.equal((await checkUrl("https://ex.com/feed/")).ok, false);
    }
  );
});

test("robots.txt down (5xx or network) means do not read; missing (404) means no rules", async () => {
  await withHost({ "/robots.txt": new Response("", { status: 503 }) }, async () => {
    assert.equal((await checkUrl("https://ex.com/a")).ok, false);
  });
  await withHost({ "/robots.txt": () => { throw new TypeError("fetch failed"); } }, async () => {
    assert.equal((await checkUrl("https://ex.com/a")).ok, false);
  });
  await withHost({}, async () => {
    assert.equal((await checkUrl("https://ex.com/a")).ok, true);
  });
});
