"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setFollow } from "@/app/follow-actions";

// Follow / Following. A rectangle, outline only, in both states
// (Daniela, 2026-09-25): Follow is a full Bone line, Following steps back
// to a faint line and dimmer type, so which is which still reads. Signed out, it is a
// link to sign in and come back here.
export function FollowButton({
  name,
  initialFollowing,
  signedIn,
  next,
  size = "sm",
}: {
  name: string;
  initialFollowing: boolean;
  signedIn: boolean;
  /** Where to come back to after signing in. */
  next: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, start] = useTransition();
  const [hover, setHover] = useState(false);

  const base =
    size === "md"
      ? "h-10 px-5 text-[12px]"
      : "h-6 px-2.5 text-[10px]";
  const cls = `inline-flex items-center justify-center rounded-[3px] border font-semibold uppercase tracking-[0.08em] transition-colors disabled:opacity-60 ${base}`;

  if (!signedIn) {
    return (
      <Link href={`/signin?next=${encodeURIComponent(next)}`} className={`${cls} border-bone/70 text-bone hover:border-bone`}>
        Follow
      </Link>
    );
  }

  function toggle() {
    const want = !following;
    setFollowing(want); // optimistic; put back if the server says no
    start(async () => {
      const res = await setFollow(name, want);
      if ("error" in res) {
        setFollowing(!want);
        if (res.error === "signin") router.push(`/signin?next=${encodeURIComponent(next)}`);
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
      aria-pressed={following}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`${cls} ${
        following
          ? "border-white/20 text-bone/60 hover:border-bone/70 hover:text-bone"
          : "border-bone/70 text-bone hover:border-bone"
      }`}
    >
      {following ? (hover ? "Unfollow" : "Following") : "Follow"}
    </button>
  );
}
