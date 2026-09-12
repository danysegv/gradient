// Orders the Signals Feed by movement rather than by date. Pure and
// side-effect free: nothing here computes, gates or touches a velocity —
// it only reads the figures app/page.tsx already computed (and already
// gated through getConfidence) and decides a display order with them. A
// tag with no entry in velocityByTagId — incubating, ungated, or the
// panel-withheld case — simply can't contribute a score, by construction.

const MIN_TAG_CONFIDENCE = 0.5;

export type FeedClip = {
  id: string;
  clipped_at: string;
  tags: { tag_id: string; confidence: number }[];
};

function scoreOf(
  clip: FeedClip,
  velocityByTagId: Map<string, number>
): number | null {
  const eligible = clip.tags.filter(
    (t) => t.confidence >= MIN_TAG_CONFIDENCE && velocityByTagId.has(t.tag_id)
  );
  if (eligible.length === 0) return null;
  // Highest-confidence tag among the eligible ones. PostgREST doesn't
  // guarantee which same-confidence tag comes back first, so a confidence
  // tie is broken on velocity instead — without this, the score (and
  // therefore the clip's position) depended on row order, not on data.
  const best = eligible.reduce((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence > a.confidence ? b : a;
    }
    return velocityByTagId.get(b.tag_id)! > velocityByTagId.get(a.tag_id)!
      ? b
      : a;
  });
  return velocityByTagId.get(best.tag_id)!;
}

/**
 * Ranks clips for display: scored clips first (by score descending), then
 * unscored clips. Ties within the scored group, and the entire unscored
 * group, sort by clipped_at descending, then by id descending as a final,
 * fully deterministic tiebreak — PostgREST doesn't guarantee row order on
 * an exact timestamp tie, even though none exists in the data today.
 * Stable (Array.prototype.sort's guarantee holds throughout) and pure —
 * never mutates `clips`.
 *
 * An empty velocityByTagId map means every clip is unscored, so every
 * comparison falls through to clipped_at descending — the input's own
 * order when it already arrived sorted that way. This is deliberately
 * the pre-09-26 and panel-withheld case: no velocities exist to order by
 * yet, so the feed reads exactly as it always has.
 */
export function rankClips<T extends FeedClip>(
  clips: T[],
  velocityByTagId: Map<string, number>
): T[] {
  return clips
    .map((clip) => ({ clip, score: scoreOf(clip, velocityByTagId) }))
    .sort((a, b) => {
      if (a.score !== null && b.score !== null && a.score !== b.score) {
        return b.score - a.score;
      }
      if ((a.score !== null) !== (b.score !== null)) {
        return a.score !== null ? -1 : 1;
      }
      if (a.clip.clipped_at !== b.clip.clipped_at) {
        return b.clip.clipped_at.localeCompare(a.clip.clipped_at);
      }
      return b.clip.id.localeCompare(a.clip.id);
    })
    .map((s) => s.clip);
}
