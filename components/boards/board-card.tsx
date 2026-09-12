import Link from "next/link";
import type { BoardSummary } from "@/lib/boards/queries";

// A board on a profile: up to four clips, then its name. A cover is a
// glimpse of a collection, not the work itself — but that glimpse is still
// a real reference, so every image keeps its own shape exactly like every
// other clip image in the app.
//
// Which four, and in what order, is lib/boards/cover.ts: the owner's chosen
// cover if there is one, otherwise the first four in the board's own order,
// so rearranging a board rearranges its cover.
//
// Two columns, each image at full column width with its natural height, so
// the two columns end at different heights and the card's bottom edge is
// ragged. That is the only honest layout here: with a fixed card width and
// four arbitrary aspect ratios, either the heights vary or the images get
// cropped, and the images never get cropped. One clip fills the width alone,
// exactly as before.
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
  const covers = board.covers.filter((c) => c.image_url);
  const single = covers.length === 1;
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bone"
    >
      <div className="overflow-hidden rounded-[3px] transition-opacity group-hover:opacity-90">
        {covers.length > 0 ? (
          <div
            className={
              single ? "" : "grid grid-cols-2 items-start gap-[3px]"
            }
          >
            {covers.map((c) => (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary external hosts, same as ClipThumbnail
              <img
                key={c.id}
                src={c.image_url!}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="block h-auto w-full"
              />
            ))}
          </div>
        ) : (
          // No clip to show yet — a card, not a photo, so an aspect ratio
          // and a background are fine here same as ClipThumbnail's
          // no-image fallback.
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-ink-2 text-center text-xs text-bone/60">
            No clips yet
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold leading-snug text-bone">
          {board.title}
        </p>
        <p className="flex items-baseline gap-2.5 text-[12px] text-bone/70">
          <span>
            <span className="font-normal tabular-nums">{board.clip_count}</span>{" "}
            {board.clip_count === 1 ? "clip" : "clips"}
          </span>
          {owner && <span className="truncate">{owner}</span>}
          {!board.is_public && (
            <span className="rounded-[2px] border border-white/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-bone/75">
              Private
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}
