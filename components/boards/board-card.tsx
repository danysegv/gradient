import Link from "next/link";
import type { BoardSummary } from "@/lib/boards/queries";

// A board on a profile: a 2×2 stack of its latest clips, then its name.
// The one place clips are cropped square — a cover is a glimpse of a
// collection, not the work itself, which the board page shows uncropped.
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
  const cells = Array.from({ length: 4 }, (_, i) => board.covers[i] ?? null);
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bone"
    >
      <div className="grid aspect-square grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-[3px] bg-ink-2 transition-opacity group-hover:opacity-90">
        {cells.map((c, i) =>
          c?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external hosts, same as ClipThumbnail
            <img
              key={c.id}
              src={c.image_url}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full bg-ink-2 object-cover"
            />
          ) : (
            <div key={c?.id ?? `empty-${i}`} className="h-full w-full bg-white/[.04]" />
          )
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
