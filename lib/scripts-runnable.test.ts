import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

// Scripts in scripts/ are run by plain node, not by Next:
//
//   node --conditions=react-server --experimental-strip-types \
//     --env-file=.env.local scripts/<name>.ts
//
// Plain node cannot resolve the "@/" path alias — that comes from
// tsconfig.json's paths, which only the bundler reads. So a script that
// reaches ANY module using "@/", however indirectly, fails on its first
// line with ERR_MODULE_NOT_FOUND and never runs at all.
//
// This has now happened twice. scripts/spend-report.ts imported
// lib/claude/spend.ts for two constants; spend.ts imports supabaseAdmin
// through "@/", so the report could not execute — despite its own header
// documenting the exact command to run it with. The failure is total and
// instant, which sounds like it would be obvious, and wasn't: nobody runs
// a reporting script until the day they need the report.
//
// The fix in that case was to move the pure parts (lib/claude/pricing.ts
// imports nothing) and have both the app and the script read those. That
// is the general shape: shared logic that scripts need has to be
// alias-free, all the way down.

function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [
    ...[...src.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => m[1]),
    ...[...src.matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]),
  ];
}

/** Every local module a script pulls in, transitively. */
function reachableFrom(entry: string): string[] {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(file)) {
      if (!spec.startsWith(".")) continue;
      const resolved = normalize(join(dirname(file), spec));
      for (const candidate of [resolved, `${resolved}.ts`, `${resolved}/index.ts`]) {
        if (existsSync(candidate) && candidate.endsWith(".ts")) {
          stack.push(candidate);
          break;
        }
      }
    }
  }
  return [...seen];
}

const scripts = readdirSync("scripts")
  .filter((f) => f.endsWith(".ts"))
  .map((f) => `scripts/${f}`);

test("every script exists to be run, so every script can be", () => {
  assert.ok(scripts.length > 0, "no scripts found — has the folder moved?");

  const broken: string[] = [];
  for (const entry of scripts) {
    for (const file of reachableFrom(entry)) {
      const offending = importsOf(file).filter((spec) => spec.startsWith("@/"));
      if (offending.length > 0) {
        broken.push(
          `${entry} → ${file} imports ${offending.join(", ")} ` +
            `(the "@/" alias; plain node cannot resolve it)`
        );
      }
    }
  }
  assert.deepEqual(broken, []);
});

test("a script's own imports carry their .ts extension", () => {
  // Node's type stripping does not resolve extensionless relative
  // specifiers. Inside lib/ the bundler forgives it; from a script it does
  // not, and the error names a file rather than the missing extension.
  const missing: string[] = [];
  for (const entry of scripts) {
    for (const spec of importsOf(entry)) {
      if (spec.startsWith(".") && !spec.endsWith(".ts") && !spec.endsWith(".json")) {
        missing.push(`${entry} imports "${spec}" without a .ts extension`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
