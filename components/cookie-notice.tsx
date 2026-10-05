"use client";

import { useSyncExternalStore } from "react";
import { noticeCookie, shouldShowNotice } from "@/lib/cookie-notice";

// One quiet line, bottom-left, once. Why it asks nothing: lib/cookie-notice.ts.
//
// No link to the privacy page yet: lib/privacy.test.ts forbids linking it
// while PRIVACY_CONTACT is a placeholder. Once the domain and inbox exist,
// add a "Privacy" link after the sentence.
//
// Decided in the browser, not on the server: reading cookies() in the root
// layout would make every page dynamic. The server snapshot is "hidden", so
// it renders nothing until the browser has looked, then fades in — nothing
// flashes, and nothing shifts the page.

const listeners = new Set<() => void>();

function subscribe(on: () => void) {
  listeners.add(on);
  return () => listeners.delete(on);
}

function visible() {
  const { pathname, search } = window.location;
  return shouldShowNotice(document.cookie, pathname, search);
}

function dismiss() {
  document.cookie = noticeCookie(window.location.protocol === "https:");
  listeners.forEach((on) => on());
}

export function CookieNotice() {
  const show = useSyncExternalStore(subscribe, visible, () => false);
  if (!show) return null;

  return (
    <aside
      aria-label="Cookies"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex animate-[fade-in_400ms_ease-out_600ms_both] items-center gap-5 border border-white/10 bg-ink-2/95 px-5 py-4 backdrop-blur-sm sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-[440px]"
    >
      <p className="text-[13px] leading-snug text-bone/75">
        Cookies here only keep you signed in and remember what you&rsquo;ve
        already seen. Nothing tracks you.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="h-9 shrink-0 rounded-[3px] bg-bone px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bone"
      >
        OK
      </button>
    </aside>
  );
}
