// Faceted filtering over a set of clips — the whole library, one curator's
// clips, or one board. Pure, so the same rules hold on every surface.
//
// Rules:
// - Within an axis, selections OR: "Poetcore or Zinepunk". The classifier
//   is told to pick one tag per axis, so AND within an axis would almost
//   always return nothing.
// - Across axes, selections AND: "(Poetcore or Zinepunk) and PhotoWork".
// - A text query matches title and credit, case-insensitively.
// - A facet's count is how many clips would match if that tag were added
//   to the current selection on its own axis — so a count never promises a
//   result the click can't deliver.
//
// Counts here are counts, not rates. They include incubating tags, because
// filtering is navigation (see the freeze rules): no velocity, no share.

export type FacetClip = {
  id: string;
  title: string | null;
  source: string | null;
  /** Tag names on this clip, already thresholded for display. */
  tagNames: string[];
};

/** axis key -> selected tag names on that axis */
export type Selection = Map<string, Set<string>>;

export function normaliseQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesQuery(clip: FacetClip, query: string): boolean {
  if (!query) return true;
  const hay = `${clip.title ?? ""} ${clip.source ?? ""}`.toLowerCase();
  return query.split(" ").every((word) => hay.includes(word));
}

function matchesSelection(
  names: Set<string>,
  selection: Selection,
  skipAxis?: string
): boolean {
  for (const [axis, selected] of selection) {
    if (axis === skipAxis || selected.size === 0) continue;
    let any = false;
    for (const s of selected) {
      if (names.has(s)) {
        any = true;
        break;
      }
    }
    if (!any) return false;
  }
  return true;
}

export function filterClips<C extends FacetClip>(
  clips: C[],
  selection: Selection,
  query: string
): C[] {
  const q = normaliseQuery(query);
  return clips.filter(
    (c) => matchesQuery(c, q) && matchesSelection(new Set(c.tagNames), selection)
  );
}

/**
 * Count per tag name. `tagAxis` maps tag name -> axis key; tags absent from
 * it are ignored. For each axis, clips are filtered by the query and by
 * every OTHER axis's selection, then counted by the tags they carry on
 * this axis.
 */
export function facetCounts(
  clips: FacetClip[],
  selection: Selection,
  query: string,
  tagAxis: Map<string, string>
): Map<string, number> {
  const q = normaliseQuery(query);
  const counts = new Map<string, number>();
  const axes = new Set(tagAxis.values());
  const prepared = clips
    .filter((c) => matchesQuery(c, q))
    .map((c) => new Set(c.tagNames));

  for (const axis of axes) {
    for (const names of prepared) {
      if (!matchesSelection(names, selection, axis)) continue;
      for (const name of names) {
        if (tagAxis.get(name) !== axis) continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function selectionSize(selection: Selection): number {
  let n = 0;
  for (const s of selection.values()) n += s.size;
  return n;
}
