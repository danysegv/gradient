// The market, read against the library, for /radar. Pure.
//
// Like for like, or not at all:
//   * Same classifier, same vocabulary — enforced upstream (lib/market/run.ts).
//   * Same denominator rule: share of every PUBLISHED tag application.
//   * Same window and the same size: the market's last three months
//     against the library's last three months, with the market read up to
//     the library's clip count (lib/market/plan.ts, matchAllowance).
//
// And a floor, like every other figure in 04AM: no market mark is drawn
// until the market has read MARKET_FLOOR_ITEMS items in the window. Below
// that a single article moves a share by points, and the overlay would
// be a picture of noise with a legend.

export const MARKET_FLOOR_ITEMS = 120;
/** A gap under this many points is not worth a sentence. */
export const GAP_MIN_POINTS = 2;

export type MarketInput = {
  /** tag id → market applications in the window (published tags only). */
  marketCounts: Map<string, number>;
  /** Items the market series classified in the window. */
  itemsRead: number;
  /** tag id → library applications in the same window (published tags only). */
  libraryRecent: Map<string, number>;
};

export type MarketOverlay =
  | { open: false; itemsRead: number; floor: number }
  | {
      open: true;
      itemsRead: number;
      /** tag id → the market's share, 0–1. */
      share: Map<string, number>;
      /** Library share minus market share, same window, biggest first. */
      ahead: MarketGap[];
      behind: MarketGap[];
    };

export type MarketGap = { id: string; library: number; market: number; gap: number };

const shares = (m: Map<string, number>) => {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return new Map([...m].map(([k, v]) => [k, total > 0 ? v / total : 0]));
};

export function computeMarketOverlay(input: MarketInput, floor = MARKET_FLOOR_ITEMS): MarketOverlay {
  if (input.itemsRead < floor) {
    return { open: false, itemsRead: input.itemsRead, floor };
  }
  const market = shares(input.marketCounts);
  const library = shares(input.libraryRecent);
  const gaps: MarketGap[] = [...new Set([...market.keys(), ...library.keys()])].map((id) => {
    const l = library.get(id) ?? 0;
    const m = market.get(id) ?? 0;
    return { id, library: l, market: m, gap: l - m };
  });
  const big = gaps.filter((g) => Math.abs(g.gap) * 100 >= GAP_MIN_POINTS);
  return {
    open: true,
    itemsRead: input.itemsRead,
    share: market,
    ahead: big.filter((g) => g.gap > 0).sort((a, b) => b.gap - a.gap),
    behind: big.filter((g) => g.gap < 0).sort((a, b) => a.gap - b.gap),
  };
}
