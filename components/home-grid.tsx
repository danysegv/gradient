"use client";

import Link from "next/link";
import { ClipThumbnail } from "./clip-thumbnail";
import { useColumnCount } from "@/lib/use-column-count";

// The masonry grid of clips. Filtering moved to the search bar
// (components/search-bar.tsx) on 2026-09-11, which searches on the server:
// tags, Claude's reading of the image, titles and credits.
const CHIP_CONFIDENCE_THRESHOLD = 0.5;
const CHIPS_PER_CARD = 3;

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

const SCRIM =
  // Bottom-anchored rather than washing the whole tile — the image stays
  // the hero. The generous pt keeps the fade zone above the text, so no
  // line ever sits in the transparent part of the ramp.
  "linear-gradient(to top, rgba(11,10,14,0.97) 0%, rgba(11,10,14,0.95) 45%, rgba(11,10,14,0.85) 68%, rgba(11,10,14,0.45) 86%, rgba(11,10,14,0) 100%)";

function ClipTile({ clip, dealt }: { clip: GridClip; dealt: boolean }) {
  const chips = displayableTags(clip).slice(0, CHIPS_PER_CARD);
  return (
    <Link
      href={`/clip/${clip.id}`}
      className={`group relative block w-full overflow-hidden rounded-[3px] ${
        dealt ? "" : "mb-4 break-inside-avoid"
      }`}
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
        style={{ background: SCRIM }}
      >
        <p className="mb-0.5 text-sm font-semibold leading-snug text-bone">
          {clip.title || clip.url}
        </p>
        {clip.source && (
          <p className="mb-2 text-xs text-bone/75">{clip.source}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, i) => (
            <span
              key={chip.editorial_name}
              className={`rounded px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                i === 0 ? "bg-oxide text-bone" : "bg-white/[.12] text-bone"
              }`}
            >
              {chip.editorial_name}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

// Round-robin deal: clip i goes to column i % count, so each column keeps
// the server's order (newest first) rather than a contiguous chunk of it.
function dealToColumns(clips: GridClip[], count: number): GridClip[][] {
  const columns: GridClip[][] = Array.from({ length: count }, () => []);
  clips.forEach((clip, i) => columns[i % count].push(clip));
  return columns;
}

export function HomeGrid({
  clips,
  emptyText = "No clips here yet.",
  layout = "columns",
}: {
  clips: GridClip[];
  emptyText?: string | null;
  /** "columns" (default) is the CSS-columns masonry everywhere today.
   * "dealt" is a JS-dealt flex-of-columns grid, profile pages only — see
   * app/curator/[name]/page.tsx for why a profile reads by date rather
   * than by the movement ranking the homepage uses. */
  layout?: "columns" | "dealt";
}) {
  const columnCount = useColumnCount();

  if (clips.length === 0) {
    return (
      <div className="px-4 pb-24">
        {emptyText ? <p className="px-4 text-sm text-bone/70">{emptyText}</p> : null}
      </div>
    );
  }

  if (layout === "dealt") {
    const columns = dealToColumns(clips, columnCount);
    return (
      <div className="px-4 pb-24">
        <div className="flex gap-4">
          {columns.map((columnClips, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
              {columnClips.map((clip) => (
                <ClipTile key={clip.id} clip={clip} dealt />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-24">
      <div className="columns-2 gap-4 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6">
        {clips.map((clip) => (
          <ClipTile key={clip.id} clip={clip} dealt={false} />
        ))}
      </div>
    </div>
  );
}
