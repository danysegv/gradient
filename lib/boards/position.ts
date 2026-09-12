// The one place that decides what order a board's clips are in, and where a
// dragged clip lands. Both the read path (getBoard) and the write path
// (moveClipOnBoard) go through here on purpose: when the display order and
// the move arithmetic were separate implementations, every drag on an
// unarranged board landed somewhere the clip hadn't been dropped.

/** Positions are spaced so there is always room to insert between two clips. */
export const POSITION_SPACING = 1000;

/**
 * Below this gap two doubles are close enough that further midpoints stop
 * being representable and clips start colliding. Renumber the board instead
 * — the one case where renumbering is correct rather than lazy.
 */
export const MIN_POSITION_GAP = 1e-6;

export type OrderedClip = {
  clip_id: string;
  position: number | null;
  added_at: string;
};

export type PositionWrite = { clip_id: string; position: number };

// position asc nulls last, then added_at desc — matches board_clips_order_idx.
export function byPositionThenNewest(
  x: { position: number | null; added_at: string },
  y: { position: number | null; added_at: string }
): number {
  if (x.position !== null && y.position !== null) return x.position - y.position;
  if (x.position !== null) return -1;
  if (y.position !== null) return 1;
  return y.added_at.localeCompare(x.added_at);
}

/**
 * What to write so `clipId` ends up between `beforeId` and `afterId`. Either
 * may be null, meaning that edge of the board.
 *
 * Normally one row: the midpoint of its new neighbours, leaving every other
 * clip's position — and therefore its relation to everything else —
 * untouched. Two cases return the whole board instead:
 *
 *  - A neighbour is still unarranged (null position). A null can't be
 *    averaged against, and falling back to the board-wide min/max drops the
 *    clip at an edge rather than where it was dropped. Since every board
 *    starts fully unarranged, this is the FIRST drag on any board.
 *  - The neighbours have run out of room between them (see MIN_POSITION_GAP).
 *
 * Neighbours are resolved from the board's own order rather than trusted from
 * the caller, so a stale id from a client that's behind degrades to an edge
 * instead of writing a position that means nothing.
 */
export function planMove(
  rows: readonly OrderedClip[],
  clipId: string,
  beforeId: string | null,
  afterId: string | null
): PositionWrite[] {
  const ordered = [...rows].sort(byPositionThenNewest);
  const moved = ordered.find((r) => r.clip_id === clipId);
  if (!moved) return [];

  const without = ordered.filter((r) => r.clip_id !== clipId);

  let index: number;
  if (beforeId !== null) {
    const i = without.findIndex((r) => r.clip_id === beforeId);
    index = i === -1 ? without.length : i + 1;
  } else if (afterId !== null) {
    const i = without.findIndex((r) => r.clip_id === afterId);
    index = i === -1 ? 0 : i;
  } else {
    index = 0;
  }

  const before = index > 0 ? without[index - 1] : null;
  const after = index < without.length ? without[index] : null;
  const neighbourUnarranged =
    (before !== null && before.position === null) ||
    (after !== null && after.position === null);

  if (!neighbourUnarranged) {
    if (before !== null && after !== null) {
      const gap = after.position! - before.position!;
      if (gap >= MIN_POSITION_GAP) {
        return [
          { clip_id: clipId, position: (before.position! + after.position!) / 2 },
        ];
      }
      // out of room — fall through to the renumber
    } else if (before !== null) {
      return [{ clip_id: clipId, position: before.position! + POSITION_SPACING }];
    } else if (after !== null) {
      return [{ clip_id: clipId, position: after.position! - POSITION_SPACING }];
    } else {
      return [{ clip_id: clipId, position: POSITION_SPACING }];
    }
  }

  const intended = [
    ...without.slice(0, index),
    moved,
    ...without.slice(index),
  ];
  return intended.map((r, i) => ({
    clip_id: r.clip_id,
    position: (i + 1) * POSITION_SPACING,
  }));
}
