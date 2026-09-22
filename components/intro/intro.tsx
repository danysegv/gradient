"use client";

import { BOARD } from "@/lib/boards/naming";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Wordmark } from "@/components/wordmark";
import { CLIP_IMAGE_REFERRER_POLICY } from "@/lib/clip-images";
import { COLOR_BUCKETS } from "@/lib/color/buckets";
import { spaceTagName } from "@/lib/intro";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/auth-forms";

// The first-visit intro. Three movements on one scrolling page:
//   1. Opening  — the mark rises, a query types itself, and real clips that
//                 carry that tag float into the field (after flim.ai).
//   2. How it works — five short steps, each with its own small animated
//                 scene instead of a static sketch (after are.na / Cosmos).
//   3. Sign-up  — a real account, email + password (app/auth/actions.ts),
//                 with a link to /signin for returning people. There is no
//                 way into the library from here without an account.
//
// Rights posture holds here too: every image is shown WHOLE (width set,
// height follows — no crop, no rounded mask), fetched from the rights
// holder's server with the one shared referrer policy. Images that fail
// to load simply leave the field.

export type IntroClip = {
  id: string;
  image_url: string;
  title: string | null;
  source: string | null;
  tags: { name: string; axis: string }[];
};

// ---------------------------------------------------------------- helpers

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (on) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false
  );
}

/** Becomes true once the element has been on screen; stays true. */
function useInView<T extends Element>(threshold = 0.35) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}

/** Types `text` out one character at a time once `start` is true. */
function useTyped(text: string, start: boolean, speed = 38, delay = 0) {
  const reduced = useReducedMotion();
  // Progress is stored WITH the text it belongs to, so a new text starts
  // from nothing without a synchronous reset inside the effect.
  const [typed, setTyped] = useState({ text: "", n: 0 });
  useEffect(() => {
    if (!start || reduced) return;
    let i = 0;
    let iv: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => {
      iv = setInterval(() => {
        i += 1;
        setTyped({ text, n: i });
        if (i >= text.length && iv) clearInterval(iv);
      }, speed);
    }, delay);
    return () => {
      clearTimeout(t);
      if (iv) clearInterval(iv);
    };
  }, [text, start, speed, delay, reduced]);
  if (!start) return "";
  if (reduced) return text;
  return typed.text === text ? text.slice(0, typed.n) : "";
}

function ClipImage({
  clip,
  className = "",
  fit = "width",
  onBroken,
}: {
  clip: IntroClip;
  className?: string;
  /** "width": fill the width, height follows. "box": fit inside a parent of
   * definite height — both dimensions capped, ratio kept, never cropped. */
  fit?: "width" | "box";
  onBroken?: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- rights holder's own server, shown whole
    <img
      ref={ref}
      src={clip.image_url}
      alt={clip.title ?? ""}
      referrerPolicy={CLIP_IMAGE_REFERRER_POLICY}
      onLoad={() => setLoaded(true)}
      onError={() => onBroken?.(clip.id)}
      className={`block ${fit === "box" ? "h-auto max-h-full w-auto max-w-full" : "h-auto w-full"} transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}

const GRID_PAPER =
  "bg-[linear-gradient(rgba(231,227,216,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(231,227,216,0.055)_1px,transparent_1px)] bg-[size:44px_44px]";

const LABEL = "text-[12px] font-semibold uppercase tracking-[0.08em]";

// ---------------------------------------------------------------- page

export function Intro({
  clips,
  total,
  since,
  linkProblem = null,
}: {
  clips: IntroClip[];
  total: number | null;
  since: string | null;
  /** Set when an emailed link bounced back here: "expired" or "invalid". */
  linkProblem?: "expired" | "invalid" | null;
}) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const markBroken = (id: string) =>
    setBroken((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  const usable = useMemo(() => clips.filter((c) => !broken.has(c.id)), [clips, broken]);

  // The richest-read clip anchors the step scenes.
  const feature = useMemo(
    () => [...usable].sort((a, b) => b.tags.length - a.tags.length)[0] ?? null,
    [usable]
  );

  return (
    <main className="relative min-h-screen bg-ink text-bone">
      <TopBar />
      <Opening clips={usable} onBroken={markBroken} />
      <HowItWorks clips={usable} feature={feature} onBroken={markBroken} />
      <SignUp total={total} since={since} linkProblem={linkProblem} />
    </main>
  );
}

// ---------------------------------------------------------------- top bar

function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div
      className={`fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-4 transition-colors duration-300 sm:px-8 ${
        scrolled ? "bg-ink/85 backdrop-blur-md" : ""
      }`}
    >
      <div className="flex items-center gap-6">
        <span aria-hidden className="h-2 w-2 bg-oxide" />
        <a href="#how" className={`${LABEL} text-bone/70 hover:text-bone`}>
          How it works
        </a>
      </div>
      <div className="flex items-center gap-5">
        <Link href="/signin" className={`${LABEL} text-bone/70 hover:text-bone`}>
          Sign in
        </Link>
        <a href="#join" className={`${LABEL} rounded-[3px] bg-bone px-3 py-1.5 text-ink`}>
          Sign up
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 1. opening

// Where floating clips sit in the field: left/top in %, width in vw (capped).
// Right-hand slots anchor from the right edge so a narrow screen can't push
// them out of frame; every image is also height-capped so it always sits
// wholly inside the field — the field never cuts a clip.
const SLOTS: { x: number; side: "l" | "r"; t: number; w: number }[] = [
  { x: 2, side: "l", t: 7, w: 11 },
  { x: 17, side: "l", t: 44, w: 8 },
  { x: 25, side: "l", t: 3, w: 9 },
  { x: 38, side: "l", t: 55, w: 12 },
  { x: 33, side: "r", t: 4, w: 10 },
  { x: 20, side: "r", t: 42, w: 9 },
  { x: 3, side: "r", t: 6, w: 12 },
  { x: 6, side: "l", t: 54, w: 10 },
  { x: 3, side: "r", t: 55, w: 9 },
];

function Opening({
  clips,
  onBroken,
}: {
  clips: IntroClip[];
  onBroken: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Queries are real tags, the ones with the most clips behind them here.
  const queries = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of clips) for (const t of c.tags) count.set(t.name, (count.get(t.name) ?? 0) + 1);
    return [...count.entries()]
      .filter(([, n]) => n >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
  }, [clips]);

  const [qi, setQi] = useState(0);
  useEffect(() => {
    if (reduced || queries.length < 2) return;
    const iv = setInterval(() => setQi((i) => (i + 1) % queries.length), 5200);
    return () => clearInterval(iv);
  }, [reduced, queries.length]);

  const query = queries[qi] ?? "";
  const typedQuery = useTyped(spaceTagName(query), ready, 55, 250);

  const shown = useMemo(() => {
    const hits = clips.filter((c) => c.tags.some((t) => t.name === query));
    const rest = clips.filter((c) => !hits.includes(c));
    return [...hits, ...rest].slice(0, SLOTS.length);
  }, [clips, query]);

  const line1 = useTyped("A library of design references,", ready, 30, 700);
  const line2 = useTyped("read by what they look like.", ready, 30, 1700);
  const line3 = useTyped("Every one credited to its source.", ready, 30, 2650);

  return (
    <section className="relative flex min-h-[100svh] flex-col pt-14">
      <div className="grid gap-8 px-4 pb-8 pt-8 sm:px-8 md:grid-cols-12 md:pt-14">
        <h1 className="overflow-hidden md:col-span-7">
          <span className="sr-only">04AM</span>
          <span
            aria-hidden
            className={`block origin-bottom transition-transform duration-[1100ms] ease-[cubic-bezier(.2,.8,.2,1)] ${
              ready ? "translate-y-0" : "translate-y-full"
            }`}
          >
            <Wordmark className="h-auto w-full max-w-[860px] text-bone" />
          </span>
        </h1>
        <div className="flex flex-col justify-between gap-6 md:col-span-4 md:col-start-9">
          <p className="min-h-[5.4em] text-[20px] font-semibold leading-[1.2] tracking-tight md:text-[24px]" aria-label="A library of design references, read by what they look like. Every one credited to its source.">
            <span aria-hidden>
              {line1}
              <br />
              {line2}
              <br />
              <span className="text-bone/60">{line3}</span>
              <span className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[0.1em] bg-oxide [animation:blink_1s_steps(1)_infinite]" />
            </span>
          </p>
          <a
            href="#join"
            className="group flex w-fit items-center gap-4 rounded-[4px] bg-bone py-2 pl-2 pr-5 text-ink transition-transform [animation:fade-in_700ms_ease-out_3200ms_both] hover:-translate-y-0.5"
          >
            <span aria-hidden className="h-9 w-9 bg-oxide transition-transform group-hover:rotate-90" />
            <span className={LABEL}>Sign up</span>
          </a>
        </div>
      </div>

      {/* The field: grid paper, floating clips, a query typing itself. */}
      <div className={`relative flex-1 overflow-hidden border-t border-white/10 ${GRID_PAPER} min-h-[440px]`}>
        <div key={query} className="absolute inset-0">
          {shown.map((clip, i) => {
            const s = SLOTS[i];
            return (
              <div
                key={clip.id}
                className="absolute"
                style={{
                  [s.side === "l" ? "left" : "right"]: `${s.x}%`,
                  top: `${s.t}%`,
                  width: `clamp(64px, ${s.w}vw, 230px)`,
                  animation: reduced
                    ? undefined
                    : `float-in 900ms cubic-bezier(.2,.8,.2,1) ${120 + i * 110}ms both, drift ${7 + (i % 4) * 1.7}s ease-in-out ${i * 0.4}s infinite alternate`,
                }}
              >
                <ClipImage clip={clip} onBroken={onBroken} className="max-h-[min(24vh,40svh)] !w-auto max-w-full" />
              </div>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-4">
          <div className="flex h-16 w-full max-w-[720px] items-center justify-between rounded-full bg-bone pl-7 pr-2 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
            <span className="truncate text-[15px] font-semibold uppercase tracking-[0.08em] md:text-[17px]">
              {typedQuery}
              <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] bg-ink [animation:blink_1s_steps(1)_infinite]" />
            </span>
            <span className={`${LABEL} rounded-full bg-ink px-5 py-3.5 text-bone`}>Search</span>
          </div>
        </div>

        <a
          href="#how"
          className={`absolute bottom-6 left-1/2 z-10 -translate-x-1/2 ${LABEL} flex flex-col items-center gap-2 text-bone/60 hover:text-bone`}
        >
          How it works
          <span aria-hidden className="block h-8 w-px bg-bone/50 [animation:scroll-cue_1.8s_ease-in-out_infinite]" />
        </a>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 2. how it works

function HowItWorks({
  clips,
  feature,
  onBroken,
}: {
  clips: IntroClip[];
  feature: IntroClip | null;
  onBroken: (id: string) => void;
}) {
  const steps = [
    {
      n: "01",
      title: "Clipped by hand",
      body: "Curators clip references from the open web. Nothing is scraped and nothing is re-hosted: each image loads from its source, whole, credited and linked back.",
      scene: <SceneClip clips={clips} onBroken={onBroken} />,
    },
    {
      n: "02",
      title: "Read by attribute",
      body: "Every clip is read against seven axes, from palette and light to typography, layout and treatment, so the library can be searched by what things look like.",
      scene: <SceneRead clip={feature} onBroken={onBroken} />,
    },
    {
      n: "03",
      title: "Search what you see",
      body: "Type a look, a subject or a technique, or pick a colour. Results come straight from those readings.",
      scene: <SceneSearch clips={clips} onBroken={onBroken} />,
    },
    {
      n: "04",
      title: "Numbers that wait",
      body: "A tag gets a figure only once there is enough behind it. Under 15 references, or younger than 45 days, it reads Early Signal. No number is made up to fill the space.",
      scene: <SceneSignal />,
    },
    {
      n: "05",
      title: `Read your ${BOARD.one} back`,
      body: `Save references to ${BOARD.many}, then read a ${BOARD.one} against the library: what it leans on, and what it is missing.`,
      scene: <SceneBoard clips={clips} onBroken={onBroken} />,
    },
  ];

  return (
    <section id="how" className="scroll-mt-14 border-t border-white/10 px-4 py-20 sm:px-8 md:py-28">
      <p className={`${LABEL} mb-14 text-bone/60 md:mb-20`}>How it works</p>
      <ol className="flex flex-col gap-24 md:gap-36">
        {steps.map((s) => (
          <Step key={s.n} {...s} />
        ))}
      </ol>
    </section>
  );
}

function Step({
  n,
  title,
  body,
  scene,
}: {
  n: string;
  title: string;
  body: string;
  scene: React.ReactNode;
}) {
  const [ref, seen] = useInView<HTMLLIElement>(0.25);
  return (
    <li ref={ref} className="grid items-center gap-10 md:grid-cols-12">
      <div
        className={`md:col-span-4 transition-all duration-700 ${
          seen ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
      >
        {/* Large numeral: regular weight (bold never touches a number). */}
        <p className="mb-6 text-[64px] font-normal leading-none text-oxide md:text-[88px]">{n}</p>
        <h2 className="mb-4 text-[30px] font-bold leading-[1.05] tracking-tight md:text-[40px]">{title}</h2>
        <p className="max-w-[40ch] text-[16px] leading-relaxed text-bone/75">{body}</p>
      </div>
      <div
        className={`md:col-span-7 md:col-start-6 transition-all delay-150 duration-700 ${
          seen ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
        }`}
      >
        <SceneFrame play={seen}>{scene}</SceneFrame>
      </div>
    </li>
  );
}

// The frame flips data-play once it scrolls into view; every scene animates
// off that one attribute with group-data-[play=1]/scene: classes (written
// out in full so Tailwind's scanner can see them).
function SceneFrame({ play, children }: { play: boolean; children: React.ReactNode }) {
  return (
    <div
      data-play={play ? "1" : "0"}
      className={`group/scene relative aspect-[16/11] overflow-hidden rounded-[6px] border border-white/10 bg-ink-2 ${GRID_PAPER}`}
    >
      {children}
    </div>
  );
}

function SceneClip({ clips, onBroken }: { clips: IntroClip[]; onBroken: (id: string) => void }) {
  const [a, b, c] = clips;
  if (!a) return null;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-6">
      <div
        className={`flex w-[82%] items-center gap-3 rounded-full border border-white/15 bg-ink px-4 py-2.5 opacity-0 transition-all duration-500 group-data-[play=1]/scene:opacity-100`}
      >
        <span className={`${LABEL} rounded-full bg-oxide px-2.5 py-1 text-bone`}>Clip</span>
        <span className="truncate text-[13px] text-bone/70">
          <span className={`inline-block max-w-0 overflow-hidden whitespace-nowrap align-bottom transition-[max-width] delay-300 duration-[1400ms] ease-linear group-data-[play=1]/scene:max-w-[40ch]`}>
            https://{a.source ?? "source.example"}/…
          </span>
        </span>
      </div>
      <div className="flex h-[58%] w-[82%] items-end justify-center gap-3">
        {[b, a, c].filter(Boolean).map((clip, i) => (
          <figure
            key={clip!.id}
            className={`flex h-full w-1/3 min-w-0 translate-y-8 flex-col items-center justify-end opacity-0 transition-all duration-700 group-data-[play=1]/scene:translate-y-0 group-data-[play=1]/scene:opacity-100`}
            style={{ transitionDelay: `${1500 + i * 220}ms` }}
          >
            <div className="flex min-h-0 flex-1 items-end justify-center">
              <ClipImage clip={clip!} fit="box" onBroken={onBroken} />
            </div>
            <figcaption className={`mt-2 h-4 w-full truncate text-center text-[11px] text-bone/70 ${i === 1 ? "" : "invisible"}`}>
              ↗ {clip!.source ?? "Source"}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function SceneRead({ clip, onBroken }: { clip: IntroClip | null; onBroken: (id: string) => void }) {
  if (!clip) return null;
  const tags = clip.tags.slice(0, 7);
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-[minmax(0,1fr)] items-center gap-6 p-6 md:p-10">
      <div className="relative flex h-full min-h-0 items-center justify-center">
        <div className="relative flex max-h-full min-h-0">
          <ClipImage clip={clip} fit="box" onBroken={onBroken} />
        {/* A scan line passes once over the image as it is "read". */}
        <span
          aria-hidden
          className={`absolute inset-x-0 top-0 h-px bg-oxide opacity-0 shadow-[0_0_18px_2px_rgba(180,69,58,0.7)] group-data-[play=1]/scene:[animation:scan_1.6s_ease-in-out_300ms_1_both]`}
        />
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {tags.map((t, i) => (
          <li
            key={t.name}
            className={`flex translate-x-4 items-baseline justify-between gap-3 border-b border-white/10 pb-2 opacity-0 transition-all duration-500 group-data-[play=1]/scene:translate-x-0 group-data-[play=1]/scene:opacity-100`}
            style={{ transitionDelay: `${1300 + i * 180}ms` }}
          >
            <span className="text-[11px] uppercase tracking-[0.08em] text-bone/55">{t.axis}</span>
            <span className="text-right text-[14px] font-semibold">{spaceTagName(t.name)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SceneSearch({ clips, onBroken }: { clips: IntroClip[]; onBroken: (id: string) => void }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.4);
  // Pick a tag that splits the six shown clips, so the filtering is visible.
  const six = clips.slice(4, 10);
  const pick = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of six) for (const t of c.tags) count.set(t.name, (count.get(t.name) ?? 0) + 1);
    const best = [...count.entries()].filter(([, n]) => n >= 2 && n <= 4).sort((a, b) => b[1] - a[1])[0];
    return best?.[0] ?? six[0]?.tags[0]?.name ?? "";
  }, [six]);
  const typed = useTyped(spaceTagName(pick), seen, 70, 400);
  const done = typed.length === spaceTagName(pick).length && seen;
  return (
    <div ref={ref} className="absolute inset-0 flex flex-col gap-4 p-6 md:p-8">
      <div className="flex h-11 flex-none items-center justify-between rounded-full bg-bone pl-5 pr-1.5 text-ink">
        <span className="truncate text-[14px]">
          {typed}
          <span className="ml-0.5 inline-block h-[1em] w-px translate-y-[0.15em] bg-ink [animation:blink_1s_steps(1)_infinite]" />
        </span>
        <span
          aria-hidden
          className="h-8 w-8 flex-none rounded-full"
          style={{
            background: `conic-gradient(${COLOR_BUCKETS.map(
              (b, i) => `${b.swatch} ${(i / COLOR_BUCKETS.length) * 360}deg ${((i + 1) / COLOR_BUCKETS.length) * 360}deg`
            ).join(", ")})`,
          }}
        />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-[repeat(2,minmax(0,1fr))] gap-3">
        {six.map((c) => {
          const hit = c.tags.some((t) => t.name === pick);
          return (
            <div
              key={c.id}
              className={`flex min-h-0 items-center justify-center transition-all duration-700 ${done && !hit ? "scale-95 opacity-15" : "opacity-100"}`}
            >
              <ClipImage clip={c} fit="box" onBroken={onBroken} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SceneSignal() {
  const [ref, seen] = useInView<HTMLDivElement>(0.4);
  const reduced = useReducedMotion();
  // Illustrative only: a made-up tag climbing past the gates. No real
  // figure is shown here, so none can be misread as one.
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen || reduced) return;
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= 42) clearInterval(iv);
    }, 70);
    return () => clearInterval(iv);
  }, [seen, reduced]);
  const shownN = reduced && seen ? 42 : n;
  const early = shownN < 15;
  return (
    <div ref={ref} className="absolute inset-0 flex items-center justify-center p-6">
      <div className="w-full max-w-[380px] rounded-[6px] border border-white/10 bg-ink p-6">
        <p className="text-[18px] font-bold">Example tag</p>
        <p className="mt-6 text-[56px] font-normal leading-none tabular-nums">{shownN}</p>
        <p className="mt-1 text-[12px] text-bone/60">references</p>
        <div className="relative mt-6 h-1.5 w-full bg-white/10">
          <span className="absolute inset-y-0 left-0 bg-bone/80 transition-[width] duration-100" style={{ width: `${(shownN / 42) * 100}%` }} />
          <span className="absolute -top-1.5 h-4 w-px bg-oxide" style={{ left: `${(15 / 42) * 100}%` }} />
          <span className="absolute -top-6 -translate-x-1/2 text-[10px] text-bone/60" style={{ left: `${(15 / 42) * 100}%` }}>
            15
          </span>
        </div>
        <p className="mt-5 border-t border-white/10 pt-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-bone/80">
          {early ? "Early Signal" : "Enough to measure · once 45 days old"}
        </p>
      </div>
    </div>
  );
}

function SceneBoard({ clips, onBroken }: { clips: IntroClip[]; onBroken: (id: string) => void }) {
  const picks = clips.slice(10, 14);
  // Illustrative widths, no figures printed: this shows the SHAPE of a
  // board reading, not a result.
  const bars = [
    { label: "What it leans on", fill: "bg-bone/80 group-data-[play=1]/scene:w-[64%]" },
    { label: "Also there", fill: "bg-bone/80 group-data-[play=1]/scene:w-[22%]" },
    { label: "Rising, and missing", fill: "bg-oxide group-data-[play=1]/scene:w-[9%]" },
  ];
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-[minmax(0,1fr)] items-center gap-6 p-6 md:p-10">
      <div className="flex h-full min-h-0 flex-col rounded-[6px] border border-white/10 bg-ink p-3">
        <p className={`${LABEL} mb-3 text-bone/70`}>Your board</p>
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[repeat(2,minmax(0,1fr))] gap-2">
          {picks.map((c, i) => (
            <div
              key={c.id}
              className={`flex min-h-0 -translate-y-6 items-center justify-center opacity-0 transition-all duration-500 group-data-[play=1]/scene:translate-y-0 group-data-[play=1]/scene:opacity-100`}
              style={{ transitionDelay: `${300 + i * 200}ms` }}
            >
              <ClipImage clip={c} fit="box" onBroken={onBroken} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <p className={`${LABEL} text-bone/70`}>Read against the library</p>
        {bars.map((b, i) => (
          <div key={b.label}>
            <p className="mb-2 text-[13px] font-semibold">{b.label}</p>
            <div className="h-2 w-full bg-white/10">
              <span
                className={`block h-full w-0 transition-[width] duration-1000 ease-out ${b.fill}`}
                style={{ transitionDelay: `${1400 + i * 250}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 3. sign-up

function SignUp({
  total,
  since,
  linkProblem,
}: {
  total: number | null;
  since: string | null;
  linkProblem: "expired" | "invalid" | null;
}) {
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  const sinceText = since
    ? new Date(since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  return (
    <section id="join" className={`relative scroll-mt-14 border-t border-white/10 ${GRID_PAPER}`}>
      <div
        ref={ref}
        className={`mx-auto flex min-h-[90svh] max-w-[760px] flex-col items-center justify-start px-4 pb-24 pt-[16svh] text-center transition-all duration-700 ${
          seen ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <Wordmark className="mb-12 h-[34px] w-auto text-bone" />

            <h2 className="mb-4 text-[40px] font-bold leading-[1.02] tracking-tight md:text-[64px]">
              Get into the library.
            </h2>
            {total !== null && (
              <p className="mb-10 text-[16px] text-bone/70">
                {total} references, clipped by hand{sinceText ? ` since ${sinceText}` : ""}.
              </p>
            )}
            <div className="w-full max-w-[420px]">
              <SignUpForm />
            </div>
            <p className="mt-6 text-[14px] text-bone/60">
              Already have an account?{" "}
              <Link href="/signin" className="text-bone underline underline-offset-4">
                Sign in
              </Link>
            </p>
            {linkProblem && (
              <p role="alert" className="mt-4 text-[14px] text-bone">
                That link has expired or was already used. Sign in, or sign up again.
              </p>
            )}
      </div>
    </section>
  );
}
