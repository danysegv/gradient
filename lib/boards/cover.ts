import { byPositionThenNewest, type OrderedClip } from "./position.ts";

/** How many clips fill a board's default cover grid. */
export const COVER_COUNT = 4;

/**
 * Which clips make up a board's cover, in the order they're shown.
 *
 * Default (coverClipIds null or empty): the first four clips in the board's
 * own order — the same order the board page reads in, so rearranging a board
 * rearranges its cover with it and nothing needs to be stored. Age has
 * nothing to do with it: a clip added a year ago that sits first is on the
 * cover, and today's clip at the bottom isn't. (The cover used to sort by
 * added_at, which is why a rearranged board's cover didn't follow.)
 *
 * Chosen: exactly the clips named, in the order named. A chosen clip that
 * has since been archived or taken off the board is skipped rather than
 * leaving a hole, and the remainder is topped up from board order so a cover
 * never silently shrinks. Choosing is a preference, not a constraint — it
 * never blocks the board from showing a full cover.
 */
export function resolveCover<T extends OrderedClip>(
  clips: readonly T[],
  coverClipIds: readonly string[] | null | undefined
): T[] {
  const inBoardOrder = [...clips].sort(byPositionThenNewest);
  if (!coverClipIds || coverClipIds.length === 0) {
    return inBoardOrder.slice(0, COVER_COUNT);
  }

  const byId = new Map(inBoardOrder.map((c) => [c.clip_id, c]));
  const chosen: T[] = [];
  const taken = new Set<string>();
  for (const id of coverClipIds) {
    const clip = byId.get(id);
    if (!clip || taken.has(id)) continue;
    chosen.push(clip);
    taken.add(id);
    if (chosen.length === COVER_COUNT) break;
  }

  for (const clip of inBoardOrder) {
    if (chosen.length === COVER_COUNT) break;
    if (taken.has(clip.clip_id)) continue;
    chosen.push(clip);
    taken.add(clip.clip_id);
  }
  return chosen;
}
