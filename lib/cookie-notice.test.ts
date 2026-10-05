import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOTICE_COOKIE, noticeCookie, shouldShowNotice } from "./cookie-notice.ts";

const ENTERED = "04am_entered=1";
const SEEN = `${NOTICE_COOKIE}=1`;

test("shown once, then never again", () => {
  assert.equal(shouldShowNotice("", "/curators", ""), true);
  assert.equal(shouldShowNotice(SEEN, "/curators", ""), false);
  assert.equal(shouldShowNotice(`${ENTERED}; ${SEEN}`, "/", ""), false);
});

test("never over the intro", () => {
  assert.equal(shouldShowNotice("", "/", ""), false, "first visit to / is the intro");
  assert.equal(shouldShowNotice(ENTERED, "/", "?intro"), false, "?intro replays it");
  assert.equal(shouldShowNotice(ENTERED, "/", ""), true, "the library, once entered");
  assert.equal(shouldShowNotice("", "/", "?q=chrome"), true, "a shared search skips the intro");
});

test("matches cookie names exactly", () => {
  assert.equal(shouldShowNotice(`x${NOTICE_COOKIE}=1`, "/privacy", ""), true);
  assert.equal(shouldShowNotice(`a=b; ${SEEN}; c=d`, "/privacy", ""), false);
});

test("the dismissal cookie is a plain preference record", () => {
  const c = noticeCookie(true);
  assert.match(c, /Path=\//);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
  assert.doesNotMatch(noticeCookie(false), /Secure/);
});

test("the intro cookie name stays in step with lib/intro.ts", () => {
  assert.match(readFileSync("lib/intro.ts", "utf8"), /ENTERED_COOKIE = "04am_entered"/);
});

// The notice asks nothing because nothing tracks. If that changes, the
// notice must become a real, refusable choice first.
test("no analytics or tracking package is installed", () => {
  const pkg = readFileSync("package.json", "utf8");
  for (const name of ["@vercel/analytics", "@vercel/speed-insights", "posthog", "@sentry/", "react-ga", "mixpanel", "plausible", "gtag", "@segment/", "hotjar"]) {
    assert.ok(!pkg.includes(`"${name}`), `${name} needs real consent — see lib/cookie-notice.ts`);
  }
});
