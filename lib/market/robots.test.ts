import { test } from "node:test";
import assert from "node:assert/strict";
import { aiReservations, allows, crawlDelay, parseRobots, readableBy } from "./robots.ts";

test("the most specific group governs, and * is the fallback", () => {
  const r = parseRobots(`
User-agent: *
Disallow: /private/

User-agent: GPTBot
Disallow: /
`);
  assert.equal(allows(r, "GPTBot", "/news/1"), false);
  assert.equal(allows(r, "04AM-Market", "/news/1"), true);
  assert.equal(allows(r, "04AM-Market", "/private/x"), false);
});

test("longest rule wins; Allow wins a tie; wildcards and $ work", () => {
  const r = parseRobots(`User-agent: *
Disallow: /wp-
Allow: /wp-content/uploads/
Disallow: /*.pdf$`);
  assert.equal(allows(r, "x", "/wp-admin/"), false);
  assert.equal(allows(r, "x", "/wp-content/uploads/a.jpg"), true);
  assert.equal(allows(r, "x", "/files/a.pdf"), false);
  assert.equal(allows(r, "x", "/files/a.pdf?x=1"), true);
});

test("an empty Disallow allows everything", () => {
  const r = parseRobots("User-agent: *\nDisallow:");
  assert.equal(allows(r, "ClaudeBot", "/"), true);
});

test("agents stacked on one group share its rules", () => {
  const r = parseRobots("User-agent: ClaudeBot\nUser-agent: anthropic-ai\nDisallow: /");
  assert.deepEqual(readableBy(r, "/a").blocked, ["ClaudeBot", "anthropic-ai"]);
});

test("barring any AI agent site-wide is a reservation, even one that is not ours", () => {
  // Colossal, 2026-09-28: GPTBot and CCBot only.
  const r = parseRobots("User-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nAllow: /");
  assert.deepEqual(aiReservations(r), ["GPTBot", "CCBot"]);
  assert.equal(readableBy(r, "/").ok, true);
  // Blocking an AI agent from one folder is not a site-wide reservation.
  const partial = parseRobots("User-agent: ClaudeBot\nDisallow: /search");
  assert.deepEqual(aiReservations(partial), []);
});

test("crawl-delay is read per agent", () => {
  const r = parseRobots("User-agent: *\nCrawl-delay: 60");
  assert.equal(crawlDelay(r, "04AM-Market"), 60);
  assert.equal(crawlDelay(parseRobots(""), "x"), null);
});
