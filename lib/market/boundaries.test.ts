import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The promises the market series makes, checked in the source so a later
// "small" change can't quietly break one.
const read = (p: string) => readFileSync(p, "utf8");

test("the market never writes anything a library figure reads", () => {
  const run = read("lib/market/run.ts");
  // It may COUNT the library (to match its size); it may never write it.
  assert.doesNotMatch(run, /from\("clip_tags"\)|classifyAndTagClip|fillEmptyAttribution/);
  const clipsUse = run.slice(run.indexOf('from("clips")'), run.indexOf('from("clips")') + 200);
  assert.match(clipsUse, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.equal(run.split('from("clips")').length, 2, "one read of clips, a count");
  assert.doesNotMatch(run, /from\("clips"\)\s*\.(insert|update|upsert|delete)/);
});

test("the market is read by the library's own classifier, metered as market spend", () => {
  const run = read("lib/market/run.ts");
  assert.match(run, /classifyClip\(/);
  assert.match(run, /kind: "market"/);
});

test("the daily pass is never open: no secret, no run", () => {
  const route = read("app/api/market/run/route.ts");
  assert.ok(route.indexOf("checkCron(request)") > -1 && route.indexOf("checkCron(request)") < route.indexOf("runMarket()"));
  const auth = read("lib/cron-auth.ts");
  assert.match(auth, /if \(!secret\) return \{ ok: false/);
});

test("public pages see aggregates, never an image address", () => {
  const sql = read("scripts/market.sql");
  const statusFn = sql.slice(sql.indexOf("function market_status"), sql.indexOf("$$;", sql.indexOf("function market_status")));
  assert.doesNotMatch(statusFn, /image_url/);
  assert.match(sql, /revoke all on market_sources, market_items, market_item_tags, market_optouts from anon, authenticated/);
  assert.doesNotMatch(read("app/radar/page.tsx"), /market_items|image_url/);
});

test("every source is checked by the compliance gate before its feed is fetched", () => {
  const run = read("lib/market/run.ts");
  const poll = run.slice(run.indexOf("async function pollFeed"), run.indexOf("async function readCounts"));
  assert.ok(poll.indexOf("checkUrl(") > -1 && poll.indexOf("checkUrl(") < poll.indexOf("fetch(url"));
  const item = run.slice(run.indexOf("async function readItem"), run.indexOf("async function discoverArchive"));
  assert.ok(item.indexOf("checkUrl(") < item.indexOf("classifyClip("), "page and image host are checked before the read");
});

test("the market comparison names only looks that already carry a published figure", () => {
  const page = read("app/radar/page.tsx");
  assert.match(page, /overlay\.ahead\.filter\(\(g\) => onRadar\.has\(g\.id\)\)/);
  assert.match(page, /overlay\.behind\.filter\(\(g\) => onRadar\.has\(g\.id\)\)/);
  assert.doesNotMatch(page, /rows=\{overlay\./);
});

test("the preview floor can never lower the live one", () => {
  const page = read("app/radar/page.tsx");
  assert.match(page, /process\.env\.NODE_ENV !== "production" && Number\.isFinite\(n\)/);
});

test("an http:// image is upgraded, and one bad image never stops the run", () => {
  const run = read("lib/market/run.ts");
  assert.match(run, /image_url: httpsImage\(raw\.image_url\)/);
  assert.match(run, /if \(isItemError\(err\)\)/);
  assert.match(run, /only https urls are supported/i);
});

test("the market is dated by publication, and the runner refuses old or undated articles", () => {
  const sql = read("scripts/market.sql");
  const last = sql.slice(sql.lastIndexOf("create or replace function market_tag_counts"));
  assert.match(last, /i\.published_at > now\(\) - make_interval\(days => window_days\)/);
  assert.doesNotMatch(last.slice(0, last.indexOf("$$;")), /classified_at > now/);
  const run = read("lib/market/run.ts");
  assert.match(run, /filter\(\(i\) => isRecent\(i\.publishedAt, now\)\)/);
  assert.match(run, /\.gt\("published_at", new Date\(Date\.now\(\) - MARKET_MAX_AGE_DAYS/);
});
