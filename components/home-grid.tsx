import Link from "next/link";
import { ClipThumbnail } from "./clip-thumbnail";

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

export function HomeGrid({
  clips,
  emptyText = "No clips here yet.",
}: {
  clips: GridClip[];
  emptyText?: string | null;
}) {
  return (
    <div className="px-4 pb-24">
      {clips.length === 0 ? (
        emptyText ? <p className="px-4 text-sm text-bone/70">{emptyText}</p> : null
      ) : (
        <div className="columns-2 gap-4 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6">
          {clips.map((clip) => {
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
  );
}
