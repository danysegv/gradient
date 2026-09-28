import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// 04AM opened to invited friends on 2026-09-28. What runs the library —
// the processing queue, the batch buttons, what anything costs — is the
// operator's, and stays off every page a curator or visitor sees.

const read = (p: string) => readFileSync(p, "utf8");

test("the batch actions are admin-only on the server, not just hidden", () => {
  for (const f of ["process", "classify", "describe", "color"]) {
    const src = read(`app/clip/${f}-actions.ts`);
    assert.match(src, /\(await getSession\(\)\)\?\.isAdmin/, f);
    assert.doesNotMatch(src, /getSessionCurator\(\)/, f);
  }
});

test("the clipper shows the queue and the process button only to an admin", () => {
  const page = read("app/clip/page.tsx");
  assert.match(page, /\{isAdmin && \(\s*<div className="lg:col-span-7">\s*<ProcessButton/);
  assert.match(page, /\.\.\.\(isAdmin\s*\?\s*\[\{ k: "To process"/);
});

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? tsx(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

test("no page quotes a price, a model or API credit", () => {
  const offenders = [...tsx("app"), ...tsx("components")].filter((f) => {
    // Comments may explain costs; rendered text may not.
    const code = read(f)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    return /&cent;|¢|\bcents?\b|API credits?|\bOpus\b|\bHaiku\b/.test(code);
  });
  assert.deepEqual(offenders, []);
});

test("the market section on /radar carries no pipeline status", () => {
  const page = read("app/radar/page.tsx");
  const section = page.slice(page.indexOf("function MarketSection"));
  assert.match(section, /if \(!overlay\?\.open\) return null;/);
  assert.doesNotMatch(section, /waiting on permission|Paused|Gathering|items read|robots\.txt|classifier/);
});
