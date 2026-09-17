// What 04AM has actually spent, and what it is on track to spend.
//
//   node --conditions=react-server --experimental-strip-types \
//     --env-file=.env.local scripts/spend-report.ts
//
//   ... scripts/spend-report.ts --days 90      # a longer history
//
// Reads api_spend, written by the meter in lib/claude/admin.ts. Writes
// nothing. Rows only exist from the day the meter shipped — anything
// before that was logged to console.log and discarded by Vercel, so an
// empty report means "not measured yet", not "nothing was spent".

import { supabaseAdmin } from "../lib/supabase/admin.ts";
// Deliberately NOT from lib/claude/spend.ts, even though that is where the
// gate reads the same two values. spend.ts imports supabaseAdmin through
// the "@/" path alias, which Next resolves from tsconfig and plain node
// cannot resolve at all — so importing it here made this script fail on
// its first line, every time, with ERR_MODULE_NOT_FOUND.
//
// pricing.ts is pure and imports nothing, which is exactly why the budget
// PARSERS live there and not beside the gate. Same functions, same env
// vars, same answer, reachable from both worlds.
import {
  formatUsd,
  parseBudgetUsd,
  parseBudgetStart,
} from "../lib/claude/pricing.ts";

const parsedBudget = parseBudgetUsd(process.env.ANTHROPIC_BUDGET_USD);
const parsedStart = parseBudgetStart(process.env.ANTHROPIC_BUDGET_FROM);
if (parsedBudget.warning) console.error(`[spend-report] ${parsedBudget.warning}`);
if (parsedStart.warning) console.error(`[spend-report] ${parsedStart.warning}`);
const BUDGET_USD = parsedBudget.usd;
const BUDGET_FROM = parsedStart.at;

const i = process.argv.indexOf("--days");
const DAYS = i > -1 ? Number(process.argv[i + 1]) : 30;
const since = new Date(Date.now() - DAYS * 86400_000).toISOString();

type Row = {
  at: string;
  model: string;
  kind: string;
  usd: string | number;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  priced: boolean;
};

const { data, error } = await supabaseAdmin
  .from("api_spend")
  .select("at, model, kind, usd, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, priced")
  .gte("at", since)
  .order("at", { ascending: false })
  .limit(100000);
if (error) throw error;
const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
  ...r,
  usd: Number(r.usd),
}));

console.log(`\n04AM API SPEND — last ${DAYS} days`);
console.log("=".repeat(64));

if (rows.length === 0) {
  console.log(
    "No rows. Either nothing has been spent since the meter shipped, or\n" +
    "the meter isn't deployed yet — check that lib/claude/admin.ts is the\n" +
    "client every call goes through (lib/claude/spend.test.ts asserts it).\n"
  );
  process.exit(0);
}

// The balance, not the calendar month. $6 topped up mid-September to last
// until mid-October crosses a month boundary; a month-to-date figure would
// reset on the 1st and say everything was fine while the money ran out.
const spent = rows
  .filter((r) => new Date(r.at) >= BUDGET_FROM)
  .reduce((n, r) => n + r.usd, 0);
const left = BUDGET_USD - spent;

const daysElapsed = Math.max(
  0.25,
  (Date.now() - BUDGET_FROM.getTime()) / 86400_000
);
const perDay = spent / daysElapsed;

const bar = (frac: number) => {
  const n = Math.max(0, Math.min(40, Math.round(frac * 40)));
  return "\u2588".repeat(n) + "\u00b7".repeat(40 - n);
};

console.log(
  `balance         ${formatUsd(spent).padStart(10)} spent of ${formatUsd(BUDGET_USD)}` +
  `   (since ${BUDGET_FROM.toISOString().slice(0, 10)})`
);
console.log(`                ${bar(spent / BUDGET_USD)}  ${((spent / BUDGET_USD) * 100).toFixed(0)}%`);
console.log(`remaining       ${formatUsd(Math.max(0, left)).padStart(10)}`);
console.log(`burn rate       ${formatUsd(perDay).padStart(10)} / day over ${daysElapsed.toFixed(1)} days`);

// ANTHROPIC_BUDGET_UNTIL is read here and nowhere else: it is a question
// about the future, not a gate. The gate stops at the balance whether or
// not a target date was ever set.
const untilRaw = process.env.ANTHROPIC_BUDGET_UNTIL;
const until = untilRaw ? new Date(untilRaw) : null;

if (perDay > 0) {
  const daysLeft = left / perDay;
  const dry = new Date(Date.now() + daysLeft * 86400_000);
  console.log(`runs dry        ${dry.toISOString().slice(0, 10).padStart(10)}  at this rate`);

  if (until && !Number.isNaN(until.getTime())) {
    const shortBy = (until.getTime() - dry.getTime()) / 86400_000;
    const needPerDay =
      left / Math.max(0.25, (until.getTime() - Date.now()) / 86400_000);
    console.log(`must reach      ${until.toISOString().slice(0, 10).padStart(10)}`);
    if (shortBy > 0.5) {
      console.log(
        `\n\u26a0 SHORT BY ${shortBy.toFixed(0)} DAYS.\n` +
        `  Sustainable rate is ${formatUsd(needPerDay)}/day; you are spending ` +
        `${formatUsd(perDay)}/day.\n` +
        `  That is ${(perDay / needPerDay).toFixed(1)}x too fast. Cutting per-clip cost is the\n` +
        `  lever — clipping less is the other one, and it is the wrong one.`
      );
    } else {
      console.log(`\n\u2713 On pace. Sustainable rate is ${formatUsd(needPerDay)}/day.`);
    }
  }
} else {
  console.log(`runs dry        ${"never".padStart(10)}  nothing spent yet`);
}

const mtd = rows
  .filter((r) => {
    const d = new Date(r.at);
    const m = new Date();
    return (
      d.getUTCFullYear() === m.getUTCFullYear() && d.getUTCMonth() === m.getUTCMonth()
    );
  })
  .reduce((n, r) => n + r.usd, 0);
console.log(`\ncalendar month  ${formatUsd(mtd).padStart(10)}  (what the console bills on)`);

const group = (key: (r: (typeof rows)[number]) => string) => {
  const m = new Map<string, { usd: number; calls: number }>();
  for (const r of rows) {
    const k = key(r);
    const held = m.get(k) ?? { usd: 0, calls: 0 };
    m.set(k, { usd: held.usd + r.usd, calls: held.calls + 1 });
  }
  return [...m].sort((a, b) => b[1].usd - a[1].usd);
};

console.log("\nBY MODEL");
console.log("-".repeat(64));
console.log("model".padEnd(24) + "calls".padStart(8) + "spend".padStart(12) + "per call".padStart(12));
for (const [model, v] of group((r) => r.model)) {
  console.log(
    model.padEnd(24) + String(v.calls).padStart(8) +
    formatUsd(v.usd).padStart(12) + formatUsd(v.usd / v.calls).padStart(12)
  );
}

const tokens = rows.reduce(
  (a, r) => ({
    input: a.input + r.input_tokens,
    output: a.output + r.output_tokens,
    write: a.write + r.cache_write_tokens,
    read: a.read + r.cache_read_tokens,
  }),
  { input: 0, output: 0, write: 0, read: 0 }
);
console.log("\nTOKENS");
console.log("-".repeat(64));
console.log(`input        ${tokens.input.toLocaleString().padStart(12)}`);
console.log(`output       ${tokens.output.toLocaleString().padStart(12)}`);
console.log(`cache write  ${tokens.write.toLocaleString().padStart(12)}  billed at 1.25x input (5-min TTL)`);
console.log(`cache read   ${tokens.read.toLocaleString().padStart(12)}  billed at 0.1x input`);
if (tokens.write > tokens.read * 2) {
  console.log(
    `\n  Cache writes far exceed reads. A 5-minute cache that is written and\n` +
    `  never read costs 25% MORE than not caching at all — that is the\n` +
    `  shape of sporadic clipping. Either batch the work, or move the\n` +
    `  system block to ttl: "1h".`
  );
}

const unpriced = rows.filter((r) => !r.priced);
if (unpriced.length > 0) {
  const models = [...new Set(unpriced.map((r) => r.model))];
  console.log(
    `\n⚠ ${unpriced.length} call(s) recorded at $0 — no price for: ${models.join(", ")}\n` +
    `  Add them to PRICES in lib/claude/pricing.ts. Until then the ceiling\n` +
    `  cannot see this spend, which is the failure mode that costs money.`
  );
}
console.log();
