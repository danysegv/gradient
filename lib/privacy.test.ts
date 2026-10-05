import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const PRIVACY_PAGE = "app/privacy/page.tsx";

// Same shape as lib/rights.test.ts, for the same reason. A privacy policy
// is a statement people are entitled to rely on, and a store listing has
// to point at one. It may exist unlinked with a placeholder address (a
// draft), or be linked with a real one (a published policy) — never linked
// with a placeholder, which looks exactly like a policy you can write to
// and is not one.

function linksToPrivacy(): string[] {
  return [...walk("app"), ...walk("components")]
    .filter((f) => f !== PRIVACY_PAGE)
    .filter((f) => /href=["'{`]?[^"'`]*\/privacy/.test(readFileSync(f, "utf8")));
}

function contactIsPlaceholder(): boolean {
  // The address lives in lib/legal.ts, shared with components/legal-link.tsx.
  const src = readFileSync("lib/legal.ts", "utf8");
  const m = src.match(/export const PRIVACY_CONTACT = "([^"]+)"/);
  assert.ok(m, "PRIVACY_CONTACT must be a string literal in lib/legal.ts so this test can read it");
  // RFC 2606 reserves .example/.test/.invalid/.localhost — they can never
  // be registered, so an address there can never deliver.
  return /\.(example|test|invalid|localhost)$/i.test(m![1]);
}

test("the privacy page is never linked while its contact is a placeholder", () => {
  if (!existsSync(PRIVACY_PAGE)) return;
  if (!contactIsPlaceholder()) return;
  assert.deepEqual(
    linksToPrivacy(),
    [],
    "PRIVACY_CONTACT is still a reserved placeholder address — set a real inbox " +
      "in app/privacy/page.tsx before linking the page or submitting a store listing"
  );
});

test("the privacy page describes the clipper's real posture", () => {
  if (!existsSync(PRIVACY_PAGE)) return;
  const src = readFileSync(PRIVACY_PAGE, "utf8");
  // These are the four claims a reviewer (and a curator) will check against
  // the code. If the extension ever stops being true to one of them, this
  // page has to change in the same commit.
  for (const claim of [
    "never sends the image",
    "browsing history",
    "tracking or analytics",
    "extension storage",
  ]) {
    assert.ok(src.toLowerCase().includes(claim.toLowerCase()), `privacy page must address: ${claim}`);
  }
});

test("nothing in the extension talks to a third party", () => {
  // The page promises the clipper reaches 04AM and nowhere else. This is
  // what makes that promise checkable rather than aspirational.
  const background = readFileSync("extension/background.js", "utf8");
  const hosts = [...background.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0].toLowerCase());
  assert.deepEqual(
    [...new Set(hosts)].sort(),
    ["http://localhost", "https://gradient-flax.vercel.app"],
    "background.js gained a new host — the privacy page names every one"
  );
});

test("links to /privacy wait for a real address", () => {
  // components/legal-link.tsx is the one sanctioned door: it must keep
  // gating on isPublished(), which reads the same literal as the test above.
  const link = readFileSync("components/legal-link.tsx", "utf8");
  assert.match(link, /if \(!isPublished\(page\)\) return/);
  const legal = readFileSync("lib/legal.ts", "utf8");
  assert.match(legal, /isPlaceholderAddress\(page === "privacy" \? PRIVACY_CONTACT : RIGHTS_CONTACT\)/);
  // And the page itself no longer carries its own copy of the address.
  assert.doesNotMatch(readFileSync("app/privacy/page.tsx", "utf8"), /const PRIVACY_CONTACT = "/);
});
