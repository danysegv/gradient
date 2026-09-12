"use client";

import { useEffect, useRef, useState } from "react";

// Some clips still have image_url issues (page links instead of direct
// image files — see the image_url investigation). Falls back to a
// title/source card instead of a broken-image icon, whether image_url is
// missing entirely or just fails to load.
export function ClipThumbnail({
  imageUrl,
  title,
  source,
  variant = "grid",
}: {
  imageUrl: string | null;
  title: string | null;
  source: string | null;
  /** "grid" keeps the masonry behaviour below exactly as it was. "detail"
   * is the single-clip view, where the image is the subject rather than a
   * tile and must not run past the fold on a tall portrait scan. "strip"
   * is a horizontal filmstrip (e.g. the curators roster): a fixed height
   * and an auto width, so images of differing aspect ratios sit at
   * differing widths in a row instead of being letterboxed into a
   * uniform box. The class strings are swapped wholesale rather than
   * merged, because Tailwind resolves conflicting utilities by
   * stylesheet order, not by the order they appear in the attribute. */
  variant?: "grid" | "detail" | "strip";
}) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // A cached image can finish loading before React hydrates and attaches
  // onLoad, which would strand it at opacity-0 forever. Catch that case on
  // mount by reading .complete directly.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  if (!imageUrl || broken) {
    // This is a card, not a photo — no image to misrepresent — so it's
    // the one place an aspect ratio and a background are still fine. It
    // still needs its own ratio so it doesn't collapse to zero height in
    // the masonry flow (or zero width in the strip flow).
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-ink-2 p-5 text-center ${
          variant === "detail"
            ? "w-full aspect-[4/3]"
            : variant === "strip"
              ? "h-[220px] w-auto flex-none aspect-[3/4]"
              : "w-full aspect-[3/4]"
        }`}
      >
        <p className="text-sm font-semibold leading-snug">
          {title || "Untitled"}
        </p>
        {source && <p className="text-xs opacity-60">{source}</p>}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary external hosts, not worth an Image remotePatterns allowlist
    <img
      ref={imgRef}
      src={imageUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      onLoad={() => setLoaded(true)}
      // The clip's own aspect ratio, always: no object-fit crop, no
      // aspect-* box, no background frame. Exactly one dimension is
      // constrained per variant and the other follows naturally —
      //   grid    w-full h-auto        (masonry — varied tile heights)
      //   detail  max-h-[78vh] w-auto  (single-clip view, centred)
      //   strip   h-[220px] w-auto     (curators filmstrip — varied widths)
      // The fade-in on load is the only visual treatment applied.
      className={`${
        variant === "detail"
          ? "mx-auto block h-auto w-auto max-h-[78vh] max-w-full"
          : variant === "strip"
            ? "block h-[220px] w-auto max-w-none flex-none"
            : "block h-auto w-full"
      } transition-opacity duration-500 ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
