import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setResolverForTests } from "../net/safe-fetch.ts";
import {
  STRIKES_TO_ARCHIVE,
  checkLink,
  nextState,
  verdictForError,
  verdictForStatus,
  type LinkState,
} from "./link-check.ts";

test("only 404 and 410 are gone; blocks, limits and outages are unsure", () => {
  for (const s of [404, 410]) assert.equal(verdictForStatus(s), "gone", String(s));
  for (const s of [200, 206, 204, 301, 304]) assert.equal(verdictForStatus(s), "ok", String(s));
  for (const s of [400, 401, 403, 405, 429, 451, 500, 502, 503, 520]) assert.equal(verdictForStatus(s), "unsure", String(s));
});

test("a domain that no longer exists is gone; other failures are unsure", () => {
  assert.equal(verdictForError(Object.assign(new Error("x"), { code: "ENOTFOUND" })).verdict, "gone");
  assert.equal(verdictForError(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } })).verdict, "gone");
  for (const code of ["EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "UND_ERR_CONNECT_TIMEOUT", "CERT_HAS_EXPIRED"]) {
    assert.equal(verdictForError(new TypeError("fetch failed", { cause: { code } })).verdict, "unsure", code);
  }
  assert.equal(verdictForError(new DOMException("timed out", "TimeoutError")).verdict, "unsure");
});

const day = (n: number) => new Date(Date.UTC(2026, 9, 16 + n, 8, 43));
const fresh: LinkState = { strikes: 0, lastStrikeAt: null };

test("three gone checks on three days archive; the same day never counts twice", () => {
  let s = fresh;
  let step = nextState(s, "gone", "ok", day(0));
  assert.deepEqual([step.next.strikes, step.archive, step.gone], [1, false, "image"]);
  s = step.next;
  step = nextState(s, "gone", "ok", new Date(day(0).getTime() + 3600_000)); // an hour later
  assert.equal(step.next.strikes, 1, "a second check the same day is not a second strike");
  step = nextState(s, "ok", "gone", day(1));
  assert.deepEqual([step.next.strikes, step.archive, step.gone], [2, false, "page"]);
  s = step.next;
  step = nextState(s, "gone", "gone", day(2));
  assert.deepEqual([step.next.strikes, step.archive, step.gone], [STRIKES_TO_ARCHIVE, true, "both"]);
});

test("a clean check clears the strikes; an unsure one leaves them", () => {
  const two: LinkState = { strikes: 2, lastStrikeAt: day(1).toISOString() };
  assert.deepEqual(nextState(two, "ok", "ok", day(2)).next, fresh);
  assert.deepEqual(nextState(two, "ok", null, day(2)).next, fresh);
  assert.deepEqual(nextState(two, "unsure", "ok", day(2)).next, two);
  assert.deepEqual(nextState(two, "ok", "unsure", day(2)).next, two);
  assert.equal(nextState(two, "unsure", "unsure", day(2)).archive, false);
});

test("checkLink reads a 404 as gone and a missing domain as gone, through safeFetch", async () => {
  const realFetch = globalThis.fetch;
  try {
    setResolverForTests(async () => ["93.184.216.34"]);
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    assert.equal((await checkLink("https://example.org/gone.jpg")).verdict, "gone");
    globalThis.fetch = (async () => new Response("", { status: 403 })) as typeof fetch;
    assert.equal((await checkLink("https://example.org/blocked.jpg")).verdict, "unsure");
    setResolverForTests(async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    });
    assert.equal((await checkLink("https://no-longer-here.example/x")).verdict, "gone");
    // An inside address is refused by the SSRF guard: unsure, never gone.
    setResolverForTests(async () => ["10.0.0.5"]);
    assert.equal((await checkLink("https://intranet.example/x")).verdict, "unsure");
  } finally {
    globalThis.fetch = realFetch;
    setResolverForTests(null);
  }
});

test("the sweep is wired the way the rules say", () => {
  const sweep = readFileSync("lib/clips/link-sweep.ts", "utf8");
  const route = readFileSync("app/api/links/run/route.ts", "utf8");
  const cron = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };
  const actions = readFileSync("app/clip/archive-actions.ts", "utf8");
  // Daily, and only for the cron secret.
  assert.ok(cron.crons.some((c) => c.path === "/api/links/run"));
  assert.match(route, /checkCron\(request\)/);
  // Every fetch goes through checkLink (safeFetch); none of its own.
  assert.doesNotMatch(sweep, /\bfetch\(/);
  assert.match(sweep, /checkLink\(/);
  // Archives say why, only active clips, and tell the curator.
  assert.match(sweep, /archived_reason: "link_gone"/);
  assert.match(sweep, /\.is\("archived_at", null\)/);
  assert.match(sweep, /notify\(\{ kind: "link_gone", actor: null, clipId: r\.id \}\)/);
  // The brakes, and the curator's last word.
  assert.match(sweep, /MAX_ARCHIVES_PER_RUN = 10/);
  assert.match(sweep, /STAND_DOWN_SHARE = 0\.3/);
  assert.match(sweep, /\.eq\("link_kept", false\)/);
  assert.match(actions, /link_kept: true/);
});
