// The Visual Genome: which looks travel together, and in which direction.
// Pure, so tested. The page draws it as a matrix grouped by axis; these
// are the rules behind the grid.
//
// Every look in the library is here, incubating ones included (Daniela,
// 2026-10-01). A cell is a share of ONE look's own references, never of
// the library-wide published total the incubation freeze protects, so an
// incubating look can sit in the grid. It is marked, sorted to the tail of
// its axis, and kept out of the one-way pulls, which are a headline
// figure.

export type GenomeLook = {
  id: string;
  name: string;
  group: string;
  total: number;
  /** Too few references for its shares to carry weight. */
  early: boolean;
  /** New vocabulary, not yet published. Shown, marked, never a headline. */
  incubating?: boolean;
};

export type GenomePair = { from: string; to: string; both: number };

export type Companion = {
  look: GenomeLook;
  both: number;
  /** Share of the picked look's references that also carry this one. */
  share: number;
  /** The same, the other way: share of this one's references carrying the picked look. */
  back: number;
};

export function companionsOf(
  pickedId: string,
  looks: Map<string, GenomeLook>,
  pairs: GenomePair[],
  limit = 10
): Companion[] {
  const picked = looks.get(pickedId);
  if (!picked || picked.total === 0) return [];
  const back = new Map(pairs.filter((p) => p.to === pickedId).map((p) => [p.from, p.both]));
  return pairs
    .filter((p) => p.from === pickedId && p.to !== pickedId && p.both > 0 && looks.has(p.to))
    .map((p) => {
      const look = looks.get(p.to)!;
      return {
        look,
        both: p.both,
        share: p.both / picked.total,
        back: look.total > 0 ? (back.get(p.to) ?? 0) / look.total : 0,
      };
    })
    .sort((a, b) => b.share - a.share || b.both - a.both || a.look.name.localeCompare(b.look.name))
    .slice(0, limit);
}

export type OneWay = {
  from: GenomeLook;
  to: GenomeLook;
  share: number;
  back: number;
  both: number;
};

/**
 * The most lopsided pairs between looks with enough references: A carries
 * B at least half the time, while B carries A much less. Ranked by the gap.
 */
export function oneWays(looks: Map<string, GenomeLook>, pairs: GenomePair[], limit = 5): OneWay[] {
  const both = new Map(pairs.map((p) => [`${p.from}|${p.to}`, p.both]));
  return pairs
    .map((p) => ({ p, from: looks.get(p.from), to: looks.get(p.to) }))
    .filter(
      (x): x is { p: GenomePair; from: GenomeLook; to: GenomeLook } =>
        !!x.from && !!x.to && !x.from.early && !x.to.early && !x.from.incubating && !x.to.incubating && x.p.from !== x.p.to && x.from.total > 0
    )
    .map(({ p, from, to }) => ({
      from,
      to,
      both: p.both,
      share: p.both / from.total,
      back: to.total > 0 ? (both.get(`${p.to}|${p.from}`) ?? 0) / to.total : 0,
    }))
    .filter((o) => o.share >= 0.5)
    .sort((a, b) => b.share - b.back - (a.share - a.back) || a.from.name.localeCompare(b.from.name))
    .slice(0, limit);
}

/** The look to open on: the most referenced one that isn't Early Signal. */
export function defaultLook(looks: GenomeLook[]): GenomeLook | null {
  const sorted = [...looks].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return sorted.find((l) => !l.early) ?? sorted[0] ?? null;
}

/**
 * Matrix order: axis by axis (the product's axis order); inside each axis
 * published looks first, then incubating ones, densest first in both.
 */
export function matrixOrder(looks: GenomeLook[], axisOrder: readonly string[] = [
  "movement", "typography", "palette_light", "layout", "treatment", "medium", "subject", "format_motion",
]): GenomeLook[] {
  const rank = (g: string) => {
    const i = axisOrder.indexOf(g);
    return i < 0 ? axisOrder.length : i;
  };
  return [...looks].sort(
    (a, b) =>
      rank(a.group) - rank(b.group) ||
      Number(!!a.incubating) - Number(!!b.incubating) ||
      b.total - a.total ||
      a.name.localeCompare(b.name)
  );
}

/**
 * Cells that mark a one-way pull: the row look carries the column look at
 * least half the time, the mirror is at least 25 points lower, and both
 * looks are published and past Early Signal. Keys are "rowId|colId".
 */
export function oneWayCells(looks: Map<string, GenomeLook>, pairs: GenomePair[]): Set<string> {
  return new Set(
    oneWays(looks, pairs, Infinity)
      .filter((o) => o.share - o.back >= 0.25)
      .map((o) => `${o.from.id}|${o.to.id}`)
  );
}
