// What a call actually cost.
//
// This used to live twice — once in classify-clip.ts and once in
// describe-clip.ts — as two hand-written arithmetic expressions with the
// per-model rates inlined as bare numbers. Both were correct, and both
// wrote the answer to console.log, where Vercel throws it away. So the
// product has never known what it spends: the only signal was a balance
// hitting zero.
//
// Pure on purpose. No client, no database, no "server-only" — it can be
// tested, and it is the one place a price is written down.

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  /** Newer SDKs break cache creation down by TTL; older ones don't. */
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
};

/** Dollars per million tokens. Verified against the Anthropic console 2026-09-17. */
export const PRICES: Record<
  string,
  { inputPerMTok: number; outputPerMTok: number }
> = {
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

// Multipliers on the model's INPUT price.
export const CACHE_WRITE_5M = 1.25;
export const CACHE_WRITE_1H = 2;
export const CACHE_READ = 0.1;

export type Priced = {
  usd: number;
  /**
   * False when the model isn't in PRICES. The call still gets recorded —
   * with usd 0 and this flag — rather than silently costing nothing,
   * because a model nobody priced is exactly the one about to surprise
   * you. lib/claude/pricing.test.ts fails if any model named in the repo
   * is missing from the table.
   */
  priced: boolean;
};

export function costOfUsage(model: string, usage: Usage): Priced {
  const price = PRICES[model];
  if (!price) return { usd: 0, priced: false };

  const inRate = price.inputPerMTok / 1e6;
  const outRate = price.outputPerMTok / 1e6;

  // Prefer the per-TTL breakdown when the SDK gives one. Without it, a
  // 1-hour cache write is billed here at the 5-minute rate and this
  // UNDER-counts by 0.75x the input price on those tokens. Recorded as a
  // known bias rather than hidden: an estimate that flatters you is worse
  // than one that doesn't exist.
  const write5m =
    usage.cache_creation?.ephemeral_5m_input_tokens ??
    (usage.cache_creation ? 0 : usage.cache_creation_input_tokens ?? 0);
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;

  const usd =
    usage.input_tokens * inRate +
    usage.output_tokens * outRate +
    write5m * inRate * CACHE_WRITE_5M +
    write1h * inRate * CACHE_WRITE_1H +
    (usage.cache_read_input_tokens ?? 0) * inRate * CACHE_READ;

  return { usd, priced: true };
}

/** For logs and copy. Sub-cent costs are the normal case here. */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(2)}`;
}

/** Fallback ceiling in dollars per UTC month when none is configured. */
export const DEFAULT_MONTHLY_BUDGET_USD = 20;

/**
 * Read the monthly ceiling from an environment variable.
 *
 * Exists because `Number(process.env.X ?? "20")` has a hole that fails in
 * the expensive direction: a typo — "five", "5 USD", "$5 ", an empty
 * string set in the dashboard — yields NaN, and `spent >= NaN` is FALSE,
 * so the ceiling is silently disabled and nothing ever says so. The one
 * setting whose whole job is to stop spending would stop working, quietly,
 * the moment someone fat-fingered it.
 *
 * So: a leading "$" and surrounding space are tolerated, because someone
 * typing "$5" plainly means five dollars and refusing it into no-ceiling
 * is the worse reading. Anything genuinely unreadable falls back to the
 * default and returns a warning for the caller to log — never to NaN, and
 * never to unlimited.
 */
export function parseMonthlyBudget(raw: string | undefined): {
  usd: number;
  warning: string | null;
} {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { usd: DEFAULT_MONTHLY_BUDGET_USD, warning: null };

  const n = Number(trimmed.replace(/^\$/, "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    return {
      usd: DEFAULT_MONTHLY_BUDGET_USD,
      warning:
        `ANTHROPIC_MONTHLY_BUDGET_USD is "${raw}", which is not a number. ` +
        `Falling back to $${DEFAULT_MONTHLY_BUDGET_USD}/month. Fix it in ` +
        `Vercel — a budget that cannot be read is a budget that is not enforced.`,
    };
  }
  return { usd: n, warning: null };
}
