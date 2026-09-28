// How much the market reads, and from where. Pure, so the budget is a
// tested rule and not a hope.
//
// Daniela's call, 2026-09-28: about 150 items a week, about $7. Sampled
// evenly across sources, because a share computed from whichever
// publication posts most would describe that publication's output, not
// the market. The same reason the library has a panel gate.

export const MARKET_WEEKLY_ITEMS = 150;
/** Of the weekly items, how many go to the archive baseline (museums). */
export const ARCHIVE_WEEKLY_ITEMS = 10;
/** Dollars per rolling 7 days the market may spend, whatever the count says. */
export const MARKET_WEEKLY_USD_DEFAULT = 7;
/**
 * Dollars of the shared balance the market must leave untouched. Clips
 * come first: the market stops before it can ever stop a curator's clip
 * from being read.
 */
export const CLIP_RESERVE_USD_DEFAULT = 2;

/**
 * How old an article may be and still count as the market (Daniela,
 * 2026-09-28: "not longer than 1–3 months"). Dated by when the
 * publication published it, never by when 04AM read it. An item with no
 * date can't prove it is recent, so it is left out.
 */
export const MARKET_MAX_AGE_DAYS = 90;

export function isRecent(publishedAt: string | null, now: number, maxDays = MARKET_MAX_AGE_DAYS): boolean {
  if (!publishedAt) return false;
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return false;
  // A date more than a day in the future is a broken feed, not news.
  return t >= now - maxDays * 86_400_000 && t <= now + 86_400_000;
}

export type Allowance = { items: number; reason: string };

/** How many items today's run may classify for one series. */
export function dailyAllowance(input: {
  weeklyItems: number;
  readLast7Days: number;
  marketUsdLast7Days: number;
  marketWeeklyUsd: number;
  /** null when the ledger could not be read: then the runner does not run. */
  balanceLeftUsd: number | null;
  clipReserveUsd: number;
  /** Rough price of one item, to stop short of a ceiling rather than past it. */
  usdPerItem: number;
}): Allowance {
  if (input.balanceLeftUsd === null) return { items: 0, reason: "spend ledger unreadable" };
  const byCount = Math.max(0, input.weeklyItems - input.readLast7Days);
  const perDay = Math.ceil(input.weeklyItems / 7);
  // The epsilon keeps 0.10 / 0.05 at 2, not 1.9999… → 1.
  const fit = (usd: number) => Math.floor(Math.max(0, usd) / input.usdPerItem + 1e-9);
  const byWeekUsd = fit(input.marketWeeklyUsd - input.marketUsdLast7Days);
  const byReserve = fit(input.balanceLeftUsd - input.clipReserveUsd);
  const items = Math.min(byCount, perDay, byWeekUsd, byReserve);
  const reason =
    items === byReserve && byReserve < perDay
      ? "holding the clip reserve"
      : items === byWeekUsd && byWeekUsd < perDay
        ? "weekly market budget reached"
        : items === byCount && byCount < perDay
          ? "weekly item count reached"
          : "daily share";
  return { items, reason };
}

/**
 * The market is kept the same size as the library (Daniela, 2026-09-28):
 * as many recent market articles read as the library has active clips,
 * so the comparison is like for like in weight as well as in method.
 * Whatever is missing is read in catch-up runs, never more than one run
 * can finish, and always inside the weekly dollar cap and the clip reserve.
 */
export const MARKET_MAX_PER_RUN = 60;

export function matchAllowance(input: {
  librarySize: number;
  marketHave: number;
  marketUsdLast7Days: number;
  marketWeeklyUsd: number;
  balanceLeftUsd: number | null;
  clipReserveUsd: number;
  usdPerItem: number;
  maxPerRun?: number;
}): Allowance {
  if (input.balanceLeftUsd === null) return { items: 0, reason: "spend ledger unreadable" };
  const fit = (usd: number) => Math.floor(Math.max(0, usd) / input.usdPerItem + 1e-9);
  const need = Math.max(0, input.librarySize - input.marketHave);
  const perRun = input.maxPerRun ?? MARKET_MAX_PER_RUN;
  const byWeekUsd = fit(input.marketWeeklyUsd - input.marketUsdLast7Days);
  const byReserve = fit(input.balanceLeftUsd - input.clipReserveUsd);
  const items = Math.min(need, perRun, byWeekUsd, byReserve);
  const reason =
    need === 0
      ? "the same size as the library"
      : items === byReserve && byReserve < Math.min(need, perRun)
        ? "holding the clip reserve"
        : items === byWeekUsd && byWeekUsd < Math.min(need, perRun)
          ? "weekly market budget reached"
          : `catching up to the library (${need} to go)`;
  return { items, reason };
}

export type Candidate = { id: string; sourceId: string; discoveredAt: string; publishedAt: string | null };

/**
 * Round-robin across sources, least-read source first, newest item first
 * within each. A source that posts forty times a day gets the same turn
 * as one that posts twice.
 */
export function pickEvenly(
  candidates: Candidate[],
  readLast7DaysBySource: Map<string, number>,
  n: number
): Candidate[] {
  const bySource = new Map<string, Candidate[]>();
  for (const c of candidates) bySource.set(c.sourceId, [...(bySource.get(c.sourceId) ?? []), c]);
  const when = (c: Candidate) => Date.parse(c.publishedAt ?? c.discoveredAt) || 0;
  for (const list of bySource.values()) list.sort((a, b) => when(b) - when(a));
  const order = [...bySource.keys()].sort(
    (a, b) => (readLast7DaysBySource.get(a) ?? 0) - (readLast7DaysBySource.get(b) ?? 0) || a.localeCompare(b)
  );
  const out: Candidate[] = [];
  while (out.length < n) {
    let took = false;
    for (const s of order) {
      const next = bySource.get(s)!.shift();
      if (!next) continue;
      out.push(next);
      took = true;
      if (out.length >= n) break;
    }
    if (!took) break;
  }
  return out;
}
