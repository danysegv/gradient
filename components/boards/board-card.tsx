import Link from "next/link";
import type { BoardSummary } from "@/lib/boards/queries";
import { CLIP_IMAGE_REFERRER_POLICY } from "@/lib/clip-images";

// A board on a profile: up to four clips in a 4:5 frame, then its name.
//
// Which four, and in what order, is lib/boards/cover.ts: the owner's chosen
// cover if there is one, otherwise the first four in the board's own order,
// so rearranging a board rearranges its cover.
//
// THIS IS THE ONE PLACE IN THE APP THAT CROPS AN IMAGE, and it is a
// deliberate exception to the rule in lib/clip-images.test.ts. A cover is
// not a reference — it is a board's identifier, sitting in a row beside
// other boards, and at thumbnail size ragged tiles of different heights
// read as broken rather than as respect for the work. Everywhere a clip is
// shown AS a clip — the feed, profiles, /clip, the board page itself — it
// still keeps its own shape and is never cropped. If this exception ever
// spreads beyond this file the tripwire fires, which is the point.
//
// One clip fills the square, two split it, three give the first the full
// height, four make a 2x2 — so every board card is the same shape whatever
// it contains. (4:5 since 2026-09-25, the shape most plates already
// drifted to; see the frame note below.)
export function BoardCard({
  href,
  board,
  owner,
}: {
  href: string;
  board: BoardSummary;
  /** Shown in search results, where boards come from many profiles. */
  owner?: string;
}) {
  const covers = board.covers.filter((c) => c.image_url).slice(0, 4);
  // Which grid cells each tile occupies, so the four layouts all square up.
  const spanFor = (count: number, i: number) => {
    if (count === 1) return "col-span-2 row-span-2";
    if (count === 2) return "row-span-2";
    if (count === 3 && i === 0) return "row-span-2";
    return "";
  };
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bone"
    >
      <div className="overflow-hidden rounded-[3px] transition-opacity group-hover:opacity-90">
        {covers.length > 0 ? (
          // The frame's size is fixed first (aspect box, grid pinned inside
          // it), so the images can never stretch it. Before 2026-09-25 the
          // grid sized itself from its images: a plate whose four covers
          // were tall grew taller than one with two, and cards in the same
          // row stopped lining up.
          <div className="relative aspect-[4/5]">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-[6px]">
            {covers.map((c, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary external hosts, same as ClipThumbnail
              <img
                key={c.id}
                src={c.image_url!}
                alt=""
                loading="lazy"
                referrerPolicy={CLIP_IMAGE_REFERRER_POLICY}
                className={`h-full w-full object-cover ${spanFor(covers.length, i)}`}
              />
            ))}
          </div>
          </div>
        ) : (
          // No clip to show yet — a card, not a photo, so a background is
          // fine here same as ClipThumbnail's no-image fallback.
          <div className="flex aspect-[4/5] w-full items-center justify-center bg-ink-2 text-center text-xs text-bone/60">
            No clips yet
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold leading-snug text-bone">
          {board.title}
        </p>
        {(owner || !board.is_public) && (
        <p className="flex items-baseline gap-2.5 text-[12px] text-bone/70">
          {owner && <span className="truncate">{owner}</span>}
          {!board.is_public && (
            <span className="rounded-[2px] border border-white/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-bone/75">
              Private
            </span>
          )}
        </p>
        )}
      </div>
    </Link>
  );
}
