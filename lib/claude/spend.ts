import "server-only";
// Relative, with the extension, NOT "@/lib/...". This module is reached
// by scripts/backfill-attribution.ts through admin.ts, and plain node
// cannot resolve the path alias — an alias here makes that script fail
// before its first line. lib/scripts-runnable.test.ts enforces it.
import { supabaseAdmin } from "../supabase/admin.ts";
import {
  costOfUsage,
  formatUsd,
  parseBudgetUsd,
  parseBudgetStart,
  type Usage,
} from "./pricing.ts";

// The ledger and the ceiling.
//
// Until now the product's only cost signal was a balance reaching zero,
// which arrives after the money is gone and says nothing about where it
// went. Two things fix that, and the second is the one that was actually
// asked for:
//
//   1. Every call is recorded with its real token usage and cost.
//   2. A hard monthly ceiling. Over budget, the call does not happen.
//
// (2) is what turns "$5 a month" from a hope into an invariant. Every
// optimisation — a smaller image, a cheaper model, the Batch API — changes
// the SLOPE. Only a ceiling changes the maximum, and a maximum is what a
// person with a fixed budget actually needs.

/**
 * The balance, in dollars, and the moment it started.
 *
 *   ANTHROPIC_BUDGET_USD   e.g. "6"
 *   ANTHROPIC_BUDGET_FROM  e.g. "2026-09-17"   (ISO, UTC)
 *
 * A BALANCE, not a monthly allowance. That distinction is the whole point:
 * $6 topped up on 17 September and needing to last until 16 October spans
 * a month boundary, and a calendar ceiling would reset on 1 October and
 * hand out the same $6 a second time. Money is not a calendar.
 *
 * FROM defaults to the start of the current UTC month when unset — the
 * conservative direction, since a shorter window counts less spend and so
 * stops sooner rather than later.
 */
const budget = parseBudgetUsd(process.env.ANTHROPIC_BUDGET_USD);
const start = parseBudgetStart(process.env.ANTHROPIC_BUDGET_FROM);
if (budget.warning) console.error(`[spend] ${budget.warning}`);
if (start.warning) console.error(`[spend] ${start.warning}`);

export const BUDGET_USD = budget.usd;
export const BUDGET_FROM = start.at;

/** Thrown before a call is made, never after. No tokens are spent. */
export class BudgetExceededError extends Error {
  readonly spentUsd: number;
  readonly budgetUsd: number;
  constructor(spentUsd: number, budgetUsd: number) {
    super(
      `API budget spent: ${formatUsd(spentUsd)} of ${formatUsd(budgetUsd)} ` +
        `since ${BUDGET_FROM.toISOString().slice(0, 10)}. No call was made, ` +
        `so no tokens were used. Clips are saved and stay queued. Raise ` +
        `ANTHROPIC_BUDGET_USD, or top up and move ANTHROPIC_BUDGET_FROM to ` +
        `today.`
    );
    this.name = "BudgetExceededError";
    this.spentUsd = spentUsd;
    this.budgetUsd = budgetUsd;
  }
}

// One DB round trip per call would be wasteful when a batch runs twenty
// in a row, so the reading is cached briefly. Short, because serverless
// spreads calls over instances that each hold their own copy: the real
// ceiling is therefore approximate by up to one window's worth of spend,
// which at these prices is cents. Being exactly right would need a
// transaction per call, and the point is to bound the bill, not to
// account for it to the penny.
const CACHE_MS = 30_000;
let cached: { usd: number; at: number } | null = null;

export async function spentSinceBudgetStart(): Promise<number | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.usd;
  const { data, error } = await supabaseAdmin.rpc("spend_since", {
    from_at: BUDGET_FROM.toISOString(),
  });
  if (error) {
    console.error(`[spend] could not read the balance: ${error.message}`);
    return null;
  }
  const usd = Number(data ?? 0);
  cached = { usd, at: Date.now() };
  return usd;
}

/**
 * Throws BudgetExceededError when this month is already spent.
 *
 * FAILS OPEN when the ledger itself can't be read, and says so loudly.
 * The alternative — refusing every call because one query failed — would
 * stop clipping over a database hiccup, and the ledger lives in the same
 * Supabase the app needs to function anyway. A ceiling is a budget
 * control, not a safety control: the worst case here is a few cents of
 * overspend, and the worst case the other way is a dead product.
 */
export async function assertWithinBudget(): Promise<void> {
  const spent = await spentSinceBudgetStart();
  if (spent === null) {
    console.error("[spend] budget NOT enforced for this call — ledger unreadable");
    return;
  }
  if (spent >= BUDGET_USD) {
    throw new BudgetExceededError(spent, BUDGET_USD);
  }
}

/**
 * Record one call. Never throws: the tokens are already spent by the time
 * this runs, so a failure here must not also destroy the work that was
 * paid for. A lost ledger row is an accounting gap; a thrown error would
 * be a lost classification.
 */
export async function recordSpend(input: {
  model: string;
  kind: string;
  usage: Usage;
  clipId?: string | null;
}): Promise<void> {
  try {
    const { usd, priced } = costOfUsage(input.model, input.usage);
    // Optimistically advance the cached figure so a batch of twenty calls
    // inside one cache window still sees the ceiling approaching.
    if (cached) cached = { usd: cached.usd + usd, at: cached.at };

    const writeTokens =
      (input.usage.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
      (input.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0) ||
      (input.usage.cache_creation_input_tokens ?? 0);

    const { error } = await supabaseAdmin.from("api_spend").insert({
      model: input.model,
      kind: input.kind,
      clip_id: input.clipId ?? null,
      input_tokens: input.usage.input_tokens,
      output_tokens: input.usage.output_tokens,
      cache_write_tokens: writeTokens,
      cache_read_tokens: input.usage.cache_read_input_tokens ?? 0,
      usd,
      priced,
    });
    if (error) console.error(`[spend] ledger write failed: ${error.message}`);
    if (!priced) {
      console.error(
        `[spend] ${input.model} has no entry in PRICES — recorded at $0. ` +
          `The ceiling cannot see this model's spend.`
      );
    }
  } catch (err) {
    console.error("[spend] ledger write threw:", err);
  }
}
