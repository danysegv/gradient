"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

// One search bar for the library, a profile or a board. The query lives in
// the URL (?q=film+photography), so a search can be shared and the server
// does the matching: tags, Claude's reading of each image, titles, credits,
// and board titles and descriptions.
export function SearchBar({
  initialQuery,
  placeholder,
}: {
  initialQuery: string;
  placeholder: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function go(next: string) {
    if (timer.current) clearTimeout(timer.current);
    const q = next.replace(/\s+/g, " ").trim();
    const href = q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname;
    startTransition(() => router.replace(href, { scroll: false }));
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
        {value && !pending && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              go("");
            }}
            className="text-[11px] font-semibold uppercase tracking-wide text-bone/70 underline underline-offset-4 hover:text-bone"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
