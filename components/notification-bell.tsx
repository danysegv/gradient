"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { myNotifications } from "@/app/notification-actions";

// The bell in the header, for curators. The circle bell (Daniela, 2026-09-30); a small Oxide dot
// when something is unseen — a dot, not a number, so the bar stays calm
// and no figure sits in it. Re-asked on every page change, which is when
// someone would expect it to be current.
export function NotificationBell() {
  const pathname = usePathname();
  const [state, setState] = useState<{ curator: boolean; unread: number }>({ curator: false, unread: 0 });

  useEffect(() => {
    let live = true;
    myNotifications()
      .then((s) => live && setState(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname]);

  if (!state.curator) return null;
  const unread = state.unread > 0 && pathname !== "/notifications";

  return (
    <Link
      href="/notifications"
      aria-label={unread ? `Notifications, ${state.unread} new` : "Notifications"}
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-bone transition-colors hover:bg-white/[0.06]"
    >
      {/* The circle bell, drawn to the search icon's exact dimensions: the
          same r=6.75 circle at the same height, and the same overall box
          (3.75 → 21 on both axes), same 1.4 stroke, same round ends. The
          base line sits on the circle; the clapper ends where the search
          handle ends. */}
      <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.4}>
        <circle cx="12.375" cy="10.5" r="6.75" />
        <path d="M3.75 17.25H21" strokeLinecap="round" />
        <path d="M10.625 21h3.5" strokeLinecap="round" />
      </svg>
      {unread && (
        <span aria-hidden className="absolute right-[9px] top-[9px] h-[7px] w-[7px] rounded-full bg-oxide ring-2 ring-ink" />
      )}
    </Link>
  );
}
