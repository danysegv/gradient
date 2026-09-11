"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipThumbnail } from "./clip-thumbnail";
import { AXES } from "@/lib/axes";
import {
  facetCounts,
  filterClips,
  selectionSize,
  type FacetClip,
  type Selection,
} from "@/lib/facets";

// Same threshold/cap as the rest of the product — see app/page.tsx and
// the earlier "filter at display time" decision. Filtering uses the full
// confidence-filtered set (not capped to CHIPS_PER_CARD), so a clip with
// 5 tags above threshold is still matched by its 4th/5th tag even though
// only the top 3 render as chips — the cap is a display-density choice,
// not a claim about which tags the clip "has."
const CHIP_CONFIDENCE_THRESHOLD = 0.5;
const CHIPS_PER_CARD = 3;

export type FilterTag = {
  tag_id: string;
  group: string;
  editorial_name: string;
};

export type GridClip = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  tags: { editorial_name: string; confidence: number }[];
};

function displayableTags(clip: GridClip) {
  return clip.tags
    .filter((t) => t.confidence >= CHIP_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence);
}

// Faceted filter over whatever set of clips it is handed — the library on
// /, one curator on /curator/[name], one board on its board page. The
// rules (OR within an axis, AND across axes, counts that match what a
// click returns) live in lib/facets.ts so every surface agrees.
export function HomeGrid({
  clips,
  filterTags,
  searchLabel = "Search titles and credits",
}: {
  clips: GridClip[];
  filterTags: FilterTag[];
  searchLabel?: string;
}) {
  const [selection, setSelection] = useState<Selection>(new Map());
  const [query, setQuery] = useState("");

  const tagAxis = useMemo(
    () => new Map(filterTags.map((t) => [t.editorial_name, t.group])),
    [filterTags]
  );

  const tagsByAxis = useMemo(() => {
    const byAxis = new Map<string, FilterTag[]>();
    for (const t of filterTags) {
      const list = byAxis.get(t.group) ?? [];
      list.push(t);
      byAxis.set(t.group, list);
    }
    return byAxis;
  }, [filterTags]);

  const facetable = useMemo(
    () =>
      clips.map((clip) => ({
        clip,
        id: clip.id,
        title: clip.title,
        source: clip.source,
        tagNames: displayableTags(clip).map((t) => t.editorial_name),
      })) satisfies (FacetClip & { clip: GridClip })[],
    [clips]
  );

  const filteredClips = useMemo(
    () => filterClips(facetable, selection, query).map((f) => f.clip),
    [facetable, selection, query]
  );

  const counts = useMemo(
    () => facetCounts(facetable, selection, query, tagAxis),
    [facetable, selection, query, tagAxis]
  );

  const active = selectionSize(selection) > 0 || query.trim() !== "";

  function toggleTag(axis: string, name: string) {
    setSelection((prev) => {
      const next = new Map(prev);
      const onAxis = new Set(next.get(axis) ?? []);
      if (onAxis.has(name)) onAxis.delete(name);
      else onAxis.add(name);
      if (onAxis.size === 0) next.delete(axis);
      else next.set(axis, onAxis);
      return next;
    });
  }

  function clearAll() {
    setSelection(new Map());
    setQuery("");
  }

  return (
    <>
      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8">
        <div className="mb-8 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label htmlFor="grid-search" className="sr-only">
              {searchLabel}
            </label>
            <input
              id="grid-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchLabel}
              className="w-full max-w-[320px] rounded-[3px] border border-white/15 bg-ink-2 px-3 py-2 text-[13px] text-bone placeholder:text-bone/50 focus:border-bone/60 focus:outline-none"
            />
            <p className="text-[12px] text-bone/70" aria-live="polite">
              <span className="font-normal tabular-nums">
                {filteredClips.length}
              </span>
              {active ? (
                <>
                  {" "}of{" "}
                  <span className="font-normal tabular-nums">{clips.length}</span>{" "}
                  clips
                </>
              ) : (
                <> clips</>
              )}
            </p>
            {active && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] font-semibold uppercase tracking-wide text-bone/75 underline underline-offset-4 hover:text-bone"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {AXES.map((axis) => {
              const axisSelection = selection.get(axis.key);
              // A tag whose count reached zero under the current filters
              // leaves the row, unless it is itself selected: a chip that
              // promises nothing is noise. Chips on the axis being chosen
              // from never vanish, because their counts ignore that axis.
              const axisTags = (tagsByAxis.get(axis.key) ?? []).filter(
                (t) =>
                  (counts.get(t.editorial_name) ?? 0) > 0 ||
                  axisSelection?.has(t.editorial_name)
              );
              if (axisTags.length === 0) return null;
              return (
                <div
                  key={axis.key}
                  className="grid items-start gap-x-4 gap-y-1.5 sm:grid-cols-[124px_minmax(0,1fr)]"
                >
                  <span className="pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-bone/70">
                    {axis.label}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {axisTags.map((tag) => {
                      const on = axisSelection?.has(tag.editorial_name) ?? false;
                      const n = counts.get(tag.editorial_name) ?? 0;
                      return (
                        <button
                          key={tag.tag_id}
                          type="button"
                          onClick={() => toggleTag(axis.key, tag.editorial_name)}
                          aria-pressed={on}
                          className={`inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bone ${
                            on
                              ? "border-oxide bg-oxide text-bone"
                              : "border-white/20 text-bone/75 hover:border-white/40 hover:text-bone"
                          }`}
                        >
                          {tag.editorial_name}
                          <span
                            className={`font-normal normal-case tabular-nums ${
                              on ? "text-bone/85" : "text-bone/55"
                            }`}
                          >
                            {n}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-4 pb-24">
        {filteredClips.length === 0 ? (
          <p className="px-5 text-sm text-bone/70">
            No clips match these filters.
          </p>
        ) : (
          <div className="columns-2 gap-4 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6">
            {filteredClips.map((clip) => {
              const chips = displayableTags(clip).slice(0, CHIPS_PER_CARD);
              return (
                <Link
                  key={clip.id}
                  href={`/clip/${clip.id}`}
                  className="group relative mb-4 block break-inside-avoid overflow-hidden rounded-[3px]"
                >
                  <div className="transition-transform duration-300 ease-out group-hover:scale-[1.02]">
                    <ClipThumbnail
                      imageUrl={clip.image_url}
                      title={clip.title}
                      source={clip.source}
                    />
                  </div>
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end p-3 pt-14 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style={{
                      // Bottom-anchored rather than washing the whole tile —
                      // the image stays the hero. The generous pt keeps the
                      // fade zone above the text, so no line ever sits in the
                      // transparent part of the ramp.
                      background:
                        "linear-gradient(to top, rgba(11,10,14,0.97) 0%, rgba(11,10,14,0.95) 45%, rgba(11,10,14,0.85) 68%, rgba(11,10,14,0.45) 86%, rgba(11,10,14,0) 100%)",
                    }}
                  >
                    <p className="mb-0.5 text-sm font-semibold leading-snug text-bone">
                      {clip.title || clip.url}
                    </p>
                    {clip.source && (
                      <p className="mb-2 text-xs text-bone/75">
                        {clip.source}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {chips.map((chip, i) => (
                        <span
                          key={chip.editorial_name}
                          className={`rounded px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                            i === 0
                              ? "bg-oxide text-bone"
                              : "bg-white/[.12] text-bone"
                          }`}
                        >
                          {chip.editorial_name}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
