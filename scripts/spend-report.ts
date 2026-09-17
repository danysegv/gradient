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
import { MONTHLY_BUDGET_USD } from "../lib/claude/spend.ts";
import { formatUsd } from "../lib/claude/pricing.ts";

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

const monthStart = new Date();
monthStart.setUTCDate(1);
monthStart.setUTCHours(0, 0, 0, 0);
const mtd = rows
  .filter((r) => new Date(r.at) >= monthStart)
  .reduce((n, r) => n + r.usd, 0);

const daysIntoMonth = Math.max(
  1,
  (Date.now() - monthStart.getTime()) / 86400_000
);
const daysInMonth = new Date(
  monthStart.getUTCFullYear(),
  monthStart.getUTCMonth() + 1,
  0
).getUTCDate();
const projected = (mtd / daysIntoMonth) * daysInMonth;

const bar = (frac: number) => {
  const n = Math.min(40, Math.round(frac * 40));
  return "█".repeat(n) + "·".repeat(40 - n);
};

console.log(`month to date   ${formatUsd(mtd).padStart(10)}  of ${formatUsd(MONTHLY_BUDGET_USD)} budget`);
console.log(`                ${bar(mtd / MONTHLY_BUDGET_USD)}  ${((mtd / MONTHLY_BUDGET_USD) * 100).toFixed(0)}%`);
console.log(`on track for    ${formatUsd(projected).padStart(10)}  by month end`);
if (projected > MONTHLY_BUDGET_USD) {
  const day = Math.ceil((MONTHLY_BUDGET_USD / (mtd / daysIntoMonth)));
  console.log(
    `\n⚠ AT THIS RATE THE CEILING IS REACHED AROUND DAY ${day} OF THE MONTH.\n` +
    `  Classification stops there and clips queue until it resets. That is\n` +
    `  the ceiling working, not breaking — but it means the cheap path is\n` +
    `  overdue, not optional.`
  );
}

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
