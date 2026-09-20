"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { COLOR_BUCKETS, isColorBucket, type ColorBucket } from "@/lib/color/buckets";

// The header's search, Cosmos-style: a pill that drops over a dimmed page,
// with the colour buckets underneath as round swatches. It drives the same
// URL the library already understands (/?q=…&color=…), so nothing about
// how search matches or ranks changed — only where you type it.
//
// A colour is still a FILTER, not a search term (see search-bar.tsx): it
// narrows what the words match and never adds to rank. A swatch on its own
// is a search in its own right — browse that bucket, most of it first.

// The orb: every bucket, as one round mark.
const ORB = `conic-gradient(${COLOR_BUCKETS.map(
  (b, i) => `${b.swatch} ${(i / COLOR_BUCKETS.length) * 360}deg ${((i + 1) / COLOR_BUCKETS.length) * 360}deg`
).join(", ")})`;

// Mounted only while open (see site-header.tsx), so the lazy initialisers
// below read the page's current search once, at open time, without forcing
// a Suspense boundary (useSearchParams) onto static pages.
function currentSearch(): { q: string; color: ColorBucket | null } {
  if (window.location.pathname !== "/") return { q: "", color: null };
  const params = new URLSearchParams(window.location.search);
  const c = params.get("color");
  return { q: params.get("q") ?? "", color: isColorBucket(c) ? c : null };
}

export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(() => currentSearch().q);
  const [color, setColor] = useState<ColorBucket | null>(() => currentSearch().color);
  const [showColors, setShowColors] = useState(true);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function go(q: string, c: ColorBucket | null) {
    const params = new URLSearchParams();
    const clean = q.replace(/\s+/g, " ").trim();
    if (clean) params.set("q", clean);
    if (c) params.set("color", c);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/?${qs}` : "/", { scroll: true });
      onClose();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search the library"
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/75 px-4 pt-[9vh] backdrop-blur-md [animation:fade-in_180ms_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-auto w-full max-w-[760px] [animation:drop-in_260ms_cubic-bezier(.2,.8,.2,1)]">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go(value, color);
          }}
          className="flex h-[60px] items-center gap-3 rounded-full bg-bone pl-6 pr-2.5 text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 flex-none text-ink/60" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <circle cx="10.5" cy="10.5" r="6.75" />
            <path d="m15.6 15.6 5.4 5.4" strokeLinecap="round" />
          </svg>
          <label htmlFor="overlay-search" className="sr-only">
            Search looks, subjects, techniques, boards
          </label>
          <input
            ref={inputRef}
            id="overlay-search"
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Try “grain on skin”"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-ink placeholder:text-ink/45 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {pending && (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/55" aria-live="polite">
              Searching
            </span>
          )}
          {color && (
            <span
              aria-hidden
              className="h-6 w-6 flex-none rounded-full ring-1 ring-ink/15"
              style={{ backgroundColor: COLOR_BUCKETS.find((b) => b.id === color)?.swatch }}
            />
          )}
          <button
            type="button"
            aria-pressed={showColors}
            aria-label={showColors ? "Hide colours" : "Search by colour"}
            onClick={() => setShowColors((v) => !v)}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full transition-colors hover:bg-ink/[0.07]"
          >
            <span aria-hidden className="block h-[26px] w-[26px] rounded-full ring-1 ring-ink/10" style={{ background: ORB }} />
          </button>
        </form>

        {showColors && (
          <div className="mt-3 rounded-[28px] bg-bone px-6 pb-6 pt-5 text-ink [animation:drop-in_300ms_cubic-bezier(.2,.8,.2,1)]">
            <p className="mb-3.5 text-[13px] font-semibold text-ink/70">Colours</p>
            <div role="group" aria-label="Filter by colour" className="flex flex-wrap gap-2">
              {COLOR_BUCKETS.map((b) => {
                const on = color === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? null : b.id;
                      setColor(next);
                      go(value, next);
                    }}
                    className={`flex h-11 items-center gap-2.5 rounded-full pl-1.5 pr-4 text-[14px] transition-colors ${
                      on ? "bg-ink text-bone" : "bg-ink/[0.06] text-ink hover:bg-ink/[0.11]"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-8 w-8 rounded-full ${on ? "ring-2 ring-bone" : "ring-1 ring-ink/15"}`}
                      style={{ backgroundColor: b.swatch }}
                    />
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-bone/50">
          Enter to search · Esc to close
        </p>
      </div>
    </div>
  );
}
