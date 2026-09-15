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

const RIGHTS_PAGE = "app/rights/page.tsx";

// A rights page is a promise to a stranger whose work is on the site and
// who may be upset. The promise is only worth the address at the bottom of
// it. This pair of tests makes the page and its contact ship together: the
// page may exist unlinked with a placeholder (that is a draft), and it may
// be linked with a real address (that is a published policy), but it can
// never be linked with a placeholder — which is a takedown route that
// silently goes nowhere while looking exactly like one that works.

function linksToRights(): string[] {
  return [...walk("app"), ...walk("components")]
    .filter((f) => f !== RIGHTS_PAGE)
    .filter((f) => /href=["'{`]?[^"'`]*\/rights/.test(readFileSync(f, "utf8")));
}

function contactIsPlaceholder(): boolean {
  const src = readFileSync(RIGHTS_PAGE, "utf8");
  const m = src.match(/const RIGHTS_CONTACT = "([^"]+)"/);
  assert.ok(m, "RIGHTS_CONTACT must be a string literal so this test can read it");
  // RFC 2606 reserves .example/.test/.invalid/.localhost — they can never
  // be registered, so an address there can never deliver.
  return /\.(example|test|invalid|localhost)$/i.test(m![1]);
}

test("the rights page is never linked while its contact is a placeholder", () => {
  if (!existsSync(RIGHTS_PAGE)) return;
  if (!contactIsPlaceholder()) return;
  assert.deepEqual(
    linksToRights(),
    [],
    "RIGHTS_CONTACT is still a reserved placeholder address — set a real inbox " +
      "in app/rights/page.tsx before linking the page from anywhere"
  );
});

test("the rights page does not claim what is not implemented yet", () => {
  if (!existsSync(RIGHTS_PAGE)) return;
  // Comments stripped first: the file's own header discusses these terms
  // precisely to explain why the PAGE must not claim them, and a test that
  // couldn't tell the two apart would punish the explanation.
  const src = readFileSync(RIGHTS_PAGE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
  // 512(i) needs terminable accounts, a published termination policy and a
  // designated agent registered with the Copyright Office. None of those
  // exist while curators are shared secrets, so the page must not imply
  // they do — claiming a safe harbour you haven't earned is the one thing
  // on this page that could make matters worse rather than better.
  for (const claim of [
    "designated agent",
    "counter-notice",
    "512(c)",
    "DMCA agent",
  ]) {
    assert.equal(
      src.toLowerCase().includes(claim.toLowerCase()),
      false,
      `the rights page claims "${claim}" — implement it first, then say it`
    );
  }
});
