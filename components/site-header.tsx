"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Wordmark } from "@/components/wordmark";
import { SearchOverlay } from "@/components/search-overlay";
import { AccountButton } from "@/components/account-button";

// One header for every page, A24-simple: the pages on one side, the mark
// dead centre, search alone on the other side. It replaced nine hand-copied
// <header> blocks (2026-09-19 rebrand), so a nav change is now one edit.
//
// No /rights link here, deliberately: lib/rights.test.ts fails the build
// while RIGHTS_CONTACT is the placeholder, and the page stays unlinked
// until that is settled.

export type NavKey = "signals" | "curators" | "genome" | "clip";

const NAV: { key: NavKey | "radar"; label: string; href: string | null }[] = [
  { key: "signals", label: "Signals", href: "/" },
  { key: "curators", label: "Curators", href: "/curators" },
  // Radar stays an inert word until velocity has a run of days to plot —
  // a link to a 404 is worse than a dim word.
  { key: "radar", label: "Radar", href: null },
  { key: "genome", label: "Genome", href: "/genome" },
  { key: "clip", label: "Clip", href: "/clip" },
];

const itemClass =
  "text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors";

export function SiteHeader({ active = null }: { active?: NavKey | null }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // "/" and ⌘K / Ctrl-K open search from anywhere, unless you're typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = NAV.map((item) => {
    const on = item.key === active;
    // The one action in the bar, in Oxide. DELIBERATE EXCEPTION (Daniela,
    // 2026-09-19) to "Oxide never as small text": ~3.6:1 on Ink, below the
    // 4.5:1 small text needs. Revisit if it reads too faint.
    if (item.key === "clip") {
      return (
        <Link
          key={item.key}
          href="/clip"
          aria-current={on ? "page" : undefined}
          className={`${itemClass} w-fit text-oxide hover:brightness-125`}
          onClick={() => setMenuOpen(false)}
        >
          + Clip
        </Link>
      );
    }
    const cls = `${itemClass} ${on ? "text-bone" : "text-bone/55 hover:text-bone"}`;
    return item.href ? (
      <Link
        key={item.key}
        href={item.href}
        aria-current={on ? "page" : undefined}
        className={cls}
        onClick={() => setMenuOpen(false)}
      >
        {item.label}
      </Link>
    ) : (
      <span key={item.key} className={`${itemClass} text-bone/30`} title="Coming soon">
        {item.label}
      </span>
    );
  });

  return (
    <>
      <header className="sticky top-0 z-40 grid h-[72px] grid-cols-[1fr_auto_1fr] items-center bg-ink/90 px-4 backdrop-blur-md sm:px-8 md:h-[84px] md:px-10">
        <div className="flex items-center">
          <nav aria-label="Pages" className="hidden items-center gap-7 lg:flex">
            {items}
          </nav>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-3 text-bone lg:hidden"
          >
            <span aria-hidden className="flex w-6 flex-col gap-[5px]">
              <span className={`h-px w-full bg-bone transition-transform ${menuOpen ? "translate-y-[3px] rotate-45" : ""}`} />
              <span className={`h-px w-full bg-bone transition-transform ${menuOpen ? "-translate-y-[3px] -rotate-45" : ""}`} />
            </span>
            <span className={itemClass}>Menu</span>
          </button>
        </div>

        <Link href="/" aria-label="04AM — Signals" className="block">
          <Wordmark className="h-[20px] w-auto text-bone md:h-[26px]" />
        </Link>

        <div className="flex items-center justify-end gap-1">
          <AccountButton />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search the library"
            className="group flex h-10 w-10 items-center justify-center rounded-full text-bone transition-colors hover:bg-white/[0.06]"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.4}>
              <circle cx="10.5" cy="10.5" r="6.75" />
              <path d="m15.6 15.6 5.4 5.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* Small screens: the pages drop down under the bar. */}
      <div
        id="site-menu"
        hidden={!menuOpen}
        className="sticky top-[72px] z-30 border-b border-white/10 bg-ink/95 px-4 pb-6 pt-2 backdrop-blur-md sm:px-8 lg:hidden"
      >
        <nav aria-label="Pages" className="flex flex-col gap-4">
          {items}
        </nav>
      </div>

      {searchOpen && <SearchOverlay onClose={closeSearch} />}
    </>
  );
}
