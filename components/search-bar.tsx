"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { COLOR_BUCKETS, type ColorBucket } from "@/lib/color/buckets";

// One search bar for the library, a profile or a board. The query lives in
// the URL (?q=film+photography&color=teal), so a search can be shared and
// the server does the matching: tags, Claude's reading of each image,
// titles, credits, and board titles and descriptions.
//
// The swatch row is a FILTER, not a search term: a colour narrows what the
// words can match and contributes nothing to rank, so "film photography"
// plus amber means "the amber ones among the film photographs" rather than
// "things that are amber-ish or film-ish". A swatch with no words typed is
// a search in its own right — browse the bucket, most-of-that-colour first.
export function SearchBar({
  initialQuery,
  placeholder,
  color = null,
  showColors = false,
}: {
  initialQuery: string;
  placeholder: string;
  /** The swatch currently applied, from the URL. */
  color?: ColorBucket | null;
  /** Only pages that pass `color` through to their query should show these. */
  showColors?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function hrefFor(rawQuery: string, nextColor: ColorBucket | null) {
    const q = rawQuery.replace(/\s+/g, " ").trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextColor) params.set("color", nextColor);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function go(next: string, nextColor: ColorBucket | null = color) {
    if (timer.current) clearTimeout(timer.current);
    startTransition(() =>
      router.replace(hrefFor(next, nextColor), { scroll: false })
    );
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(next), 350);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
      className="relative w-full max-w-[640px]"
    >
      <label htmlFor="library-search" className="sr-only">
        {placeholder}
      </label>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-bone/55"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <circle cx="8.5" cy="8.5" r="5.75" />
        <path d="m13 13 4.5 4.5" strokeLinecap="round" />
      </svg>
      <input
        id="library-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            setValue("");
            go("");
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-12 w-full rounded-[3px] border border-white/15 bg-ink-2 pl-11 pr-28 text-[15px] text-bone placeholder:text-bone/50 focus:border-bone/60 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-3">
        {pending && (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-bone/60" aria-live="polite">
            Searching
          </span>
        )}
        {(value || color) && !pending && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              go("", null);
            }}
            className="text-[11px] font-semibold uppercase tracking-wide text-bone/70 underline underline-offset-4 hover:text-bone"
          >
            Clear
          </button>
        )}
      </div>

      {showColors && (
        <div
          role="group"
          aria-label="Filter by colour"
          className="mt-3 flex flex-wrap items-center gap-1.5"
        >
          {COLOR_BUCKETS.map((b) => {
            const on = color === b.id;
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={on}
                title={b.label}
                onClick={() => go(value, on ? null : b.id)}
                className={`h-6 w-6 rounded-full transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bone ${
                  on
                    ? "ring-2 ring-bone ring-offset-2 ring-offset-ink"
                    : "ring-1 ring-white/25"
                }`}
                style={{ backgroundColor: b.swatch }}
              >
                <span className="sr-only">
                  {on ? `Remove the ${b.label} filter` : `Filter by ${b.label}`}
                </span>
              </button>
            );
          })}
          {color && (
            <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-bone/60">
              {COLOR_BUCKETS.find((b) => b.id === color)?.label}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
