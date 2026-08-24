"use client";

import { useMemo, useState } from "react";
import { ClipThumbnail } from "./clip-thumbnail";

// Same threshold/cap as the rest of the product — see app/page.tsx and
// the earlier "filter at display time" decision. Filtering uses the full
// confidence-filtered set (not capped to CHIPS_PER_CARD), so a clip with
// 5 tags above threshold is still matched by its 4th/5th tag even though
// only the top 3 render as chips — the cap is a display-density choice,
// not a claim about which tags the clip "has."
const CHIP_CONFIDENCE_THRESHOLD = 0.5;
const CHIPS_PER_CARD = 3;

// Display order matches 04am-taxonomy.md's section headings.
const AXES: { key: string; label: string }[] = [
  { key: "movement", label: "Movements" },
  { key: "typography", label: "Typography" },
  { key: "palette_light", label: "Palette & Light" },
  { key: "layout", label: "Layout" },
  { key: "format_motion", label: "Format & Motion" },
  { key: "treatment", label: "Treatment" },
];

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

export function HomeGrid({
  clips,
  filterTags,
}: {
  clips: GridClip[];
  filterTags: FilterTag[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const tagsByAxis = useMemo(() => {
    const byAxis = new Map<string, FilterTag[]>();
    for (const t of filterTags) {
      const list = byAxis.get(t.group) ?? [];
      list.push(t);
      byAxis.set(t.group, list);
    }
    return byAxis;
  }, [filterTags]);

  // Multi-select ANDs together: a clip must carry every selected tag,
  // not just any of them.
  const filteredClips = useMemo(() => {
    if (selected.size === 0) return clips;
    return clips.filter((clip) => {
      const names = new Set(displayableTags(clip).map((t) => t.editorial_name));
      for (const sel of selected) {
        if (!names.has(sel)) return false;
      }
      return true;
    });
  }, [clips, selected]);

  function toggleTag(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <>
      <div className="mx-auto max-w-[1180px] px-8">
        <div className="mb-8 flex flex-wrap items-start gap-x-6 gap-y-3">
          {AXES.map((axis) => {
            const axisTags = tagsByAxis.get(axis.key);
            if (!axisTags?.length) return null;
            return (
              <div
                key={axis.key}
                className="flex flex-wrap items-center gap-1.5"
              >
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-bone/70">
                  {axis.label}
                </span>
                {axisTags.map((tag) => (
                  <button
                    key={tag.tag_id}
                    type="button"
                    onClick={() => toggleTag(tag.editorial_name)}
                    aria-pressed={selected.has(tag.editorial_name)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                      selected.has(tag.editorial_name)
                        ? "border-oxide bg-oxide text-bone"
                        : "border-white/20 text-bone/75 hover:border-white/40 hover:text-bone"
                    }`}
                  >
                    {tag.editorial_name}
                  </button>
                ))}
              </div>
            );
          })}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[11px] font-semibold uppercase tracking-wide text-bone/75 underline"
            >
              Clear
            </button>
          )}
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
                <a
                  key={clip.id}
                  href={clip.url}
                  target="_blank"
                  rel="noreferrer"
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
                </a>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
