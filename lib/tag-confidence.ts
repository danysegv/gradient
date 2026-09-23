/**
 * The line a reading has to clear to count as a trait anywhere people
 * see it: the chips in the feed and on profiles, the traits on a clip
 * page, the order of the Signals feed, the plate radar, Attention.
 *
 * Below it the reading still exists — the clipper shows it, dimmed, and
 * the classifier's own record keeps it — it just isn't a claim about the
 * work. Every consumer imports this so the line can only move in one
 * place.
 */
export const PUBLIC_TAG_CONFIDENCE = 0.5;
