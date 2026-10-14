import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { securityHeaders } from "./security-headers.ts";

// Secrets stay on the server (Daniela, 2026-10-14). Anything a "use client"
// file imports, however indirectly, ships to every visitor's browser. This
// walks that import graph and fails if it ever reaches code that reads a
// server-only variable (the service-role key, the Anthropic key, the cron
// secret, curator passwords…) or a module marked "server-only".
//
// Only NEXT_PUBLIC_* variables may be read in browser code, and the two
// that exist (the Supabase URL and its publishable key) are public by
// design: the database's own rules decide what that key can do.

const ROOTS = ["app", "components", "lib"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null; // a package
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function importsOf(file: string): string[] {
  // Type-only imports are erased before anything ships, so they don't count.
  const src = readFileSync(file, "utf8").replace(/^\s*(?:import|export)\s+type\s[^;]*;/gm, "");
  const specs = [
    ...[...src.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
  ];
  return specs.map((s) => resolve(file, s)).filter((f): f is string => f !== null);
}

const directive = (src: string, d: string) => new RegExp(`^\\s*["']${d}["']`, "m").test(src.split("\n").slice(0, 5).join("\n"));

function serverOnlyReason(file: string): string | null {
  const src = readFileSync(file, "utf8");
  if (/^\s*import\s+["']server-only["']/m.test(src)) return "imports server-only";
  const secret = [...src.matchAll(/process\.env\.([A-Z0-9_]+)/g)]
    .map((m) => m[1])
    .find((name) => !name.startsWith("NEXT_PUBLIC_") && name !== "NODE_ENV");
  return secret ? `reads process.env.${secret}` : null;
}

test("no browser code can reach a server secret", () => {
  const clientFiles = ROOTS.flatMap(walk).filter((f) => directive(readFileSync(f, "utf8"), "use client"));
  assert.ok(clientFiles.length > 10, "found too few client components; is the walk broken?");
  const offenders: string[] = [];
  for (const entry of clientFiles) {
    const seen = new Set<string>();
    const stack: [string, string[]][] = [[entry, [entry]]];
    while (stack.length) {
      const [file, path] = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const src = readFileSync(file, "utf8");
      // A "use server" file reached from the browser becomes a reference to
      // a server action; its body never ships.
      if (file !== entry && directive(src, "use server")) continue;
      const why = serverOnlyReason(file);
      if (why) {
        offenders.push(`${path.join(" → ")} (${why})`);
        continue;
      }
      for (const next of importsOf(file)) stack.push([next, [...path, next]]);
    }
  }
  assert.deepEqual(offenders, []);
});

test("cookies the server sets are HTTPS-only in production", () => {
  const files = ROOTS.flatMap(walk);
  const missing: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:cookies\(\)\)|cookieStore|res\.cookies|store)\.set\(/g)) {
      const call = src.slice(m.index, src.indexOf(");", m.index) + 2);
      // The options may be built just above the call (lib/supabase/auth-server.ts).
      const context = src.slice(Math.max(0, m.index! - 300), m.index) + call;
      if (!/secure/.test(context)) missing.push(`${f}: ${call.split("\n")[0].trim()}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("browsers are told to use HTTPS only, for two years, subdomains too", () => {
  const hsts = securityHeaders({}).find((h) => h.key === "Strict-Transport-Security")?.value ?? "";
  assert.match(hsts, /max-age=63072000/);
  assert.match(hsts, /includeSubDomains/);
  // And images or scripts written as http:// are fetched over https.
  assert.match(securityHeaders({}).find((h) => h.key === "Content-Security-Policy")!.value, /upgrade-insecure-requests/);
});
