"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setLike } from "@/app/boards/like-actions";

// Like, as a heart and nothing else (Daniela, 2026-09-25): a solid heart
// in Slate, the brand's blue, that turns Oxide red once liked. Drawn, not
// typed — U+2665 renders as a colour emoji on iOS. The label lives in
// aria-label and the tooltip, not on the page.
export function LikeButton({ clipId, initialLiked }: { clipId: string; initialLiked: boolean }) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [pending, start] = useTransition();

  function toggle() {
    const want = !liked;
    setLiked(want);
    start(async () => {
      const res = await setLike(clipId, want);
      if ("error" in res) {
        setLiked(!want);
        if (res.error === "signin") router.push(`/signin?next=${encodeURIComponent(`/clip/${clipId}`)}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? "Liked — saved to Obsessions" : "Like"}
      title={liked ? "In Obsessions" : "Like"}
      className={`inline-flex h-[42px] w-[42px] items-center justify-center transition-transform active:scale-90 disabled:opacity-60 ${
        liked ? "text-oxide" : "text-slate hover:brightness-125"
      }`}
    >
      <svg aria-hidden viewBox="0 0 16 14" className="h-[22px] w-[22px]" fill="currentColor">
        <path d="M8 13 1.9 7.1A3.6 3.6 0 0 1 8 2.4a3.6 3.6 0 0 1 6.1 4.7Z" />
      </svg>
    </button>
  );
}
