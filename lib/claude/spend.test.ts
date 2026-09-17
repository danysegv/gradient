import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DEFAULT_BUDGET_USD } from "./pricing.ts";

// lib/claude/spend.ts and admin.ts both import "server-only", which throws
// under `node --test`, so these are structural assertions on the source —
// the same approach lib/taxonomy-freeze.test.ts uses for the surfaces it
// guards. They pin the ORDER of operations, which is the part that costs
// money if it changes, and which a type checker cannot see.

const SPEND = readFileSync("lib/claude/spend.ts", "utf8");
const ADMIN = readFileSync("lib/claude/admin.ts", "utf8");

test("the budget is checked BEFORE the call, and the ledger written after", () => {
  // Reversed, the ceiling becomes a report: you find out you're over
  // budget having already paid for the call that put you there.
  const check = ADMIN.indexOf("assertWithinBudget()");
  const call = ADMIN.indexOf("client.messages.parse(...args)");
  const record = ADMIN.indexOf("recordSpend(");
  assert.ok(check > -1 && call > -1 && record > -1, "wrapper lost a step");
  assert.ok(check < call, "budget must be checked before the API call");
  assert.ok(call < record, "spend must be recorded after the API call");
});

test("recording is awaited, not fired and forgotten", () => {
  // A serverless function can be frozen the moment its handler resolves.
  // An un-awaited insert is dropped silently and only under load.
  assert.match(ADMIN, /await recordSpend\(/);
});

test("the ledger write can never throw", () => {
  // The tokens are already spent by the time it runs. A throw here would
  // turn an accounting gap into a lost classification.
  assert.match(SPEND, /export async function recordSpend[\s\S]*?try \{/);
  assert.match(SPEND, /catch \(err\) \{\s*console\.error\("\[spend\] ledger write threw:", err\);/);
});

test("the budget gate fails OPEN when the ledger is unreadable", () => {
  // Deliberate, and the opposite of the panel gate in lib/publication.ts.
  // There, an unknown value must not be published. Here, refusing every
  // call because one query failed would stop clipping over a database
  // hiccup — and the ledger lives in the same Supabase the app already
  // needs. Worst case open is cents; worst case closed is a dead product.
  const fn = SPEND.slice(SPEND.indexOf("export async function assertWithinBudget"));
  assert.match(fn, /if \(spent === null\) \{[\s\S]*?return;/);
  assert.match(fn, /budget NOT enforced/);
});

test("the ceiling is configurable and does not default to the target", () => {
  // Shipping a $5 default before per-clip cost comes down would stop
  // classification mid-month. The env var is the knob; the default is
  // headroom, not the goal.
  assert.match(SPEND, /process\.env\.ANTHROPIC_BUDGET_USD/);
  assert.ok(
    DEFAULT_BUDGET_USD > 11,
    "the default must sit above current monthly spend (~$11) or it throttles on day one"
  );
});

test("the gate measures a BALANCE, not a calendar month", () => {
  // The bug this replaces: a month-to-date ceiling resets on the 1st while
  // a prepaid balance does not, so $6 topped up on 17 September to last
  // until 16 October would be handed out twice.
  assert.match(SPEND, /spend_since/);
  assert.match(SPEND, /ANTHROPIC_BUDGET_FROM/);
  assert.equal(
    /month_to_date_spend/.test(SPEND),
    false,
    "the gate still reads a calendar month — it resets while the money doesn't"
  );
});

test("the budget is parsed, not coerced", () => {
  // Number(env) yields NaN on a typo, and `spent >= NaN` is false — the
  // ceiling disabled silently, in the expensive direction. spend.ts must
  // go through the validating parser.
  assert.match(SPEND, /parseBudgetUsd\(process\.env\.ANTHROPIC_BUDGET_USD\)/);
  assert.equal(
    /Number\(\s*process\.env\.ANTHROPIC_BUDGET_USD/.test(SPEND),
    false,
    "spend.ts coerces the env var directly instead of parsing it"
  );
  assert.match(SPEND, /if \(budget\.warning\) console\.error/);
});

test("every call site goes through the metered client", () => {
  // The wrapper only meters what routes through it. A file importing the
  // SDK directly would spend money the ledger never sees and the ceiling
  // never counts.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : e.name.endsWith(".ts") || e.name.endsWith(".tsx")
          ? [`${dir}/${e.name}`]
          : []
    );
  const offenders = [...walk("lib"), ...walk("app")]
    .filter((f) => f !== "lib/claude/admin.ts")
    .filter((f) => /from "@anthropic-ai\/sdk"/.test(readFileSync(f, "utf8")))
    // The zod helper is a type utility, not a client.
    .filter((f) => !/from "@anthropic-ai\/sdk\/helpers\/zod"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(
    offenders,
    [],
    "these construct their own Anthropic client and bypass the meter"
  );
});
