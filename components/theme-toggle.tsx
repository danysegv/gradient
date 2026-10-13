"use client";

import { useSyncExternalStore } from "react";
import { nextTheme, readTheme, themeCookie, type ThemeSetting } from "@/lib/theme";

// Light, dark, or follow the device. One 40px round button, the same size
// and hover as search and the bell beside it, so the header's spacing
// holds. The glyph is drawn, never an emoji: a circle, filled for dark,
// open for light, half and half for "follow the device".

const LABEL: Record<ThemeSetting, string> = {
  system: "Theme: follows your device",
  light: "Theme: light",
  dark: "Theme: dark",
};

// The cookie is the store: every toggle on the page reads it, and a choice
// tells them all to re-read.
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const snapshot = () => readTheme(document.cookie);
// The server, and the first client render, say "system": the page itself
// is already the right colour (the boot script in app/layout.tsx), only
// this glyph waits for hydration.
const serverSnapshot = (): ThemeSetting => "system";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const setting = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  function choose() {
    const next = nextTheme(setting);
    const root = document.documentElement;
    root.classList.add("theme-switching");
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    document.cookie = themeCookie(next, window.location.protocol === "https:");
    listeners.forEach((fn) => fn());
    window.setTimeout(() => root.classList.remove("theme-switching"), 400);
  }

  return (
    <button
      type="button"
      onClick={choose}
      aria-label={`${LABEL[setting]}. Change theme`}
      title={LABEL[setting]}
      className={`flex h-10 w-10 items-center justify-center rounded-full text-bone transition-colors hover:bg-white/[0.06] ${className}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth={1.4}>
        <circle cx="12" cy="12" r="7.25" fill={setting === "dark" ? "currentColor" : "none"} />
        {setting === "system" && <path d="M12 4.75a7.25 7.25 0 0 1 0 14.5z" fill="currentColor" stroke="none" />}
      </svg>
    </button>
  );
}
