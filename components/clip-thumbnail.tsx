"use client";

import { useState } from "react";

// Some clips still have image_url issues (page links instead of direct
// image files — see the image_url investigation). Falls back to a
// title/source card instead of a broken-image icon, whether image_url is
// missing entirely or just fails to load.
export function ClipThumbnail({
  imageUrl,
  title,
  source,
}: {
  imageUrl: string | null;
  title: string | null;
  source: string | null;
}) {
  const [broken, setBroken] = useState(false);

  if (!imageUrl || broken) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-5 text-center">
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
      src={imageUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  );
}
