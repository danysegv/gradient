import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOTICE_COOKIE, noticeCookie, shouldShowNotice } from "./cookie-notice.ts";

const SEEN = `${NOTICE_COOKIE}=1`;

test("shown once, then never again", () => {
  assert.equal(shouldShowNotice("", false), true);
  assert.equal(shouldShowNotice(SEEN, false), false);
  assert.equal(shouldShowNotice(`a=b; ${SEEN}; c=d`, false), false);
});

test("never over the intro", () => {
  assert.equal(shouldShowNotice("", true), false);
});

test("matches cookie names exactly", () => {
  assert.equal(shouldShowNotice(`x${NOTICE_COOKIE}=1`, false), true);
});

test("the dismissal cookie is a plain preference record", () => {
  const c = noticeCookie(true);
  assert.match(c, /Path=\//);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
  assert.doesNotMatch(noticeCookie(false), /Secure/);
});

test("the intro marks itself, so the notice can see it", () => {
  assert.match(readFileSync("components/intro/intro.tsx", "utf8"), /<main\s+data-intro=""/);
});

// The regression: 04am_entered is httpOnly, so document.cookie never holds it.
// Anything the notice decides in the browser must not depend on it.
test("the notice never reads the httpOnly intro cookie", () => {
  for (const f of ["lib/cookie-notice.ts", "components/cookie-notice.tsx"]) {
    const code = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /04am_entered|ENTERED_COOKIE/, f);
  }
});

// The notice asks nothing because nothing tracks. If that changes, the
// notice must become a real, refusable choice first.
test("no analytics or tracking package is installed", () => {
  const pkg = readFileSync("package.json", "utf8");
  for (const name of ["@vercel/analytics", "@vercel/speed-insights", "posthog", "@sentry/", "react-ga", "mixpanel", "plausible", "gtag", "@segment/", "hotjar"]) {
    assert.ok(!pkg.includes(`"${name}`), `${name} needs real consent — see lib/cookie-notice.ts`);
  }
});
