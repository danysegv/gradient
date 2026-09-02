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
   * tile and must not run past the fold on a tall portrait scan. The two
   * class strings are swapped wholesale rather than merged, because
   * Tailwind resolves conflicting utilities by stylesheet order, not by
   * the order they appear in the attribute. */
  variant?: "grid" | "detail";
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
    // No natural image dimensions to size from — give the fallback its
    // own ratio so it doesn't collapse to zero height in the masonry flow.
    return (
      <div
        className={`flex w-full flex-col items-center justify-center gap-1 bg-ink-2 p-5 text-center ${
          variant === "detail" ? "aspect-[4/3]" : "aspect-[3/4]"
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
      // No object-fit crop, no fixed aspect ratio — natural dimensions are
      // exactly what makes the masonry grid read as varied-height Cosmos-
      // style rather than a uniform card grid. The Ink-2 ground + fade-in
      // stops tiles from popping in hard against the page as they lazy-load.
      className={`${
        variant === "detail"
          ? "mx-auto block h-auto w-full max-h-[78vh] object-contain"
          : "block h-auto w-full"
      } bg-ink-2 transition-opacity duration-500 ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
