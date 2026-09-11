// The board radar: what a board is made of, and how that differs from the
// library as a whole. Pure, so the rules below are tested, not assumed.
//
// It is NOT the trend radar and borrows nothing from it: no window, no
// velocity, no panel gate. A board is a hand-picked set, so a "trend"
// inside one would only describe the order someone saved things in. What a
// board can honestly say is its composition, and that is all this computes.
//
// - Board share: of the board's clips that carry any tag, the fraction
//   carrying this one at display confidence. Every tag gets one, incubating
//   included: it is a fact about this board, divided by this board.
// - Library share: the same fraction across every active clip. PUBLISHED
//   tags only, per the freeze. An incubating tag gets no library-wide share.
// - Lean: board share minus library share, in points. Published tags only.
// - Quadrant: core (on at least CORE_SHARE of the board) or not, crossed
//   with over- or under-represented against the library.
// - The radar is withheld below BOARD_RADAR_MIN_CLIPS: with 5 clips one clip
//   moves a share by 20 points, and the plot would describe an afternoon.
//   Shares are still listed, as exact counts of a small set.
//
// Both thresholds are starting points, like the confidence bands, not
// derived from data.

export const BOARD_RADAR_MIN_CLIPS = 12;
export const CORE_SHARE = 0.25;
/** Matches the chips and traits everywhere else in the product. */
export const PRESENCE_CONFIDENCE = 0.5;
/** A published tag absent from the board is worth naming above this. */
export const NOTABLE_ABSENCE_SHARE = 0.15;
const ABSENCE_LIMIT = 3;

export type Quadrant = "signature" | "foundation" | "accent" | "background";

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  signature: "Signature",
  foundation: "Foundation",
  accent: "Accent",
  background: "Background",
};

export type RadarClipTag = {
  name: string;
  group: string;
  confidence: number;
  isPublished: boolean;
};

export type LibraryPresence = {
  /** published tags only */
  tags: { name: string; group: string; clips: number }[];
  classifiedClips: number;
};

export type RadarTag = {
  name: string;
  group: string;
  isPublished: boolean;
  count: number;
  boardShare: number;
  libraryShare: number | null;
  lean: number | null;
  quadrant: Quadrant | null;
};

export type BoardRadar = {
  classifiedClips: number;
  readable: boolean;
  clipsToReadable: number;
  tags: RadarTag[];
  absent: { name: string; group: string; libraryShare: number }[];
};

export function quadrantOf(boardShare: number, lean: number): Quadrant {
  const core = boardShare >= CORE_SHARE;
  const over = lean > 0;
  if (core) return over ? "signature" : "foundation";
  return over ? "accent" : "background";
}

export function computeBoardRadar(
  boardClips: { tags: RadarClipTag[] }[],
  library: LibraryPresence
): BoardRadar {
  const classified = boardClips.filter((c) => c.tags.length > 0);
  const n = classified.length;

  const counts = new Map<string, { group: string; isPublished: boolean; count: number }>();
  for (const clip of classified) {
    // A clip counts once per tag, whatever duplicates the join returns.
    const seen = new Set<string>();
    for (const t of clip.tags) {
      if (t.confidence < PRESENCE_CONFIDENCE || seen.has(t.name)) continue;
      seen.add(t.name);
      const entry = counts.get(t.name) ?? {
        group: t.group,
        isPublished: t.isPublished,
        count: 0,
      };
      entry.count += 1;
      counts.set(t.name, entry);
    }
  }

  const libraryByName = new Map(library.tags.map((t) => [t.name, t]));
  const libShare = (name: string): number | null => {
    const row = libraryByName.get(name);
    if (!row || library.classifiedClips <= 0) return null;
    return row.clips / library.classifiedClips;
  };

  const readable = n >= BOARD_RADAR_MIN_CLIPS;

  const tags: RadarTag[] = [...counts.entries()]
    .map(([name, e]) => {
      const boardShare = n === 0 ? 0 : e.count / n;
      const libraryShare = e.isPublished ? libShare(name) : null;
      const lean = libraryShare === null ? null : boardShare - libraryShare;
      return {
        name,
        group: e.group,
        isPublished: e.isPublished,
        count: e.count,
        boardShare,
        libraryShare,
        lean,
        quadrant: readable && lean !== null ? quadrantOf(boardShare, lean) : null,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const absent = readable
    ? library.tags
        .filter((t) => !counts.has(t.name))
        .map((t) => ({ name: t.name, group: t.group, libraryShare: libShare(t.name) ?? 0 }))
        .filter((t) => t.libraryShare >= NOTABLE_ABSENCE_SHARE)
        .sort((a, b) => b.libraryShare - a.libraryShare)
        .slice(0, ABSENCE_LIMIT)
    : [];

  return {
    classifiedClips: n,
    readable,
    clipsToReadable: Math.max(0, BOARD_RADAR_MIN_CLIPS - n),
    tags,
    absent,
  };
}

/** "58%" — whole percent; never bold, per the identity rules. */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** "+31", "−4", "0" — points, with a true minus sign. */
export function formatLean(lean: number): string {
  const pts = Math.round(lean * 100);
  if (pts === 0) return "0";
  return pts > 0 ? `+${pts}` : `−${Math.abs(pts)}`;
}
