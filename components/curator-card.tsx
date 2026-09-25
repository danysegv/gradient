"use client";

import Link from "next/link";
import { useState } from "react";
import { CLIP_IMAGE_REFERRER_POLICY } from "@/lib/clip-images";

// A curator as a card, the way the Signals rail shows a trend: a small
// frame of their work, their name, the credit, one plain figure. Used on
// /curators and in search results when a query names a curator.
//
// The work is shown whole — three slots of equal width, each image fitted
// inside its slot and never cropped (lib/clip-images.test.ts). An image
// that fails to load leaves its slot empty rather than drawing a broken
// icon.

export type CuratorCardData = {
  name: string;
  displayName: string | null;
  /** Clips in the library, when known. Plain figure, never bold. */
  clips?: number | null;
  strip: { id: string; image_url: string | null; title: string | null }[];
};

export function CuratorCard({
  curator,
  className = "",
  follow,
}: {
  curator: CuratorCardData;
  className?: string;
  /** A Follow button, shown small beside the name. */
  follow?: React.ReactNode;
}) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const slots = curator.strip.filter((c) => c.image_url).slice(0, 3);
  return (
    <div className={`group flex flex-col rounded-lg border border-white/10 bg-ink-2 p-4 transition-colors hover:border-white/25 ${className}`}>
      <Link href={`/curator/${encodeURIComponent(curator.name)}`} tabIndex={-1} className="flex flex-col">
        <div className="mb-4 grid h-[150px] grid-cols-3 gap-2" aria-hidden>
          {[0, 1, 2].map((i) => {
            const c = slots[i];
            return (
              <div key={i} className="flex min-w-0 items-center justify-center">
                {c && !broken.has(c.id) && (
                  // eslint-disable-next-line @next/next/no-img-element -- rights holder's own server, shown whole
                  <img
                    src={c.image_url!}
                    alt=""
                    loading="lazy"
                    referrerPolicy={CLIP_IMAGE_REFERRER_POLICY}
                    onError={() => setBroken((b) => new Set(b).add(c.id))}
                    className="block h-auto max-h-full w-auto max-w-full transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                )}
              </div>
            );
          })}
        </div>
      </Link>
      {/* The name, with Follow right beside it. The button sits outside the
          link: a button inside an <a> is invalid, and its click must not
          open the page. */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Link href={`/curator/${encodeURIComponent(curator.name)}`} className="min-w-0 truncate text-[15px] font-bold leading-tight">
          {curator.displayName ?? curator.name}
        </Link>
        {follow && <div className="flex-none">{follow}</div>}
      </div>
      <Link href={`/curator/${encodeURIComponent(curator.name)}`} tabIndex={-1} className="flex flex-col">
        <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-white/10 pt-2">
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-bone/70">
            @{curator.name}
          </span>
          {curator.clips != null && (
            <span className="flex-none text-[13px] font-normal tabular-nums text-bone/80">{curator.clips}</span>
          )}
        </div>
      </Link>
    </div>
  );
}
