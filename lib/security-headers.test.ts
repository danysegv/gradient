import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contentSecurityPolicy, securityHeaders } from "./security-headers.ts";

// Security review 2026-10-13, #4.

const SUPABASE = "https://faxdpkqkufbywoxfmnka.supabase.co";

function directive(csp: string, name: string): string[] {
  const d = csp.split("; ").find((p) => p.startsWith(`${name} `) || p === name);
  assert.ok(d, `missing ${name}`);
  return d.split(" ").slice(1);
}

test("nobody can frame 04AM", () => {
  const csp = contentSecurityPolicy({ supabaseUrl: SUPABASE });
  assert.deepEqual(directive(csp, "frame-ancestors"), ["'none'"]);
  const h = securityHeaders({ supabaseUrl: SUPABASE });
  assert.equal(h.find((x) => x.key === "X-Frame-Options")?.value, "DENY");
});

test("scripts only from 04AM; no eval in production", () => {
  const csp = contentSecurityPolicy({ supabaseUrl: SUPABASE });
  const scripts = directive(csp, "script-src");
  assert.ok(scripts.includes("'self'"));
  assert.ok(!scripts.includes("'unsafe-eval'"));
  assert.ok(!scripts.some((s) => s.startsWith("http") || s === "*"), scripts.join(" "));
  assert.deepEqual(directive(csp, "object-src"), ["'none'"]);
  assert.deepEqual(directive(csp, "form-action"), ["'self'"]);
});

test("hotlinked clip images still load from any https host", () => {
  // 04AM links, it does not host: every clip image is on someone else's server.
  const csp = contentSecurityPolicy({ supabaseUrl: SUPABASE });
  assert.ok(directive(csp, "img-src").includes("https:"));
});

test("the browser may talk to 04AM and Supabase, nothing else", () => {
  const csp = contentSecurityPolicy({ supabaseUrl: `${SUPABASE}/` });
  assert.deepEqual(directive(csp, "connect-src"), ["'self'", SUPABASE]);
});

test("development keeps what the dev server needs", () => {
  const csp = contentSecurityPolicy({ supabaseUrl: SUPABASE, dev: true });
  assert.ok(directive(csp, "script-src").includes("'unsafe-eval'"));
  assert.ok(!csp.includes("upgrade-insecure-requests"));
  assert.ok(!securityHeaders({ dev: true }).some((h) => h.key === "Strict-Transport-Security"));
});

test("next.config applies the headers to every route", () => {
  const src = readFileSync("next.config.ts", "utf8");
  assert.match(src, /source: "\/:path\*"/);
  assert.match(src, /securityHeaders\(/);
});
