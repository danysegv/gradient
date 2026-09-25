"use client";

import { useSyncExternalStore } from "react";

// "Get the clipper" — shown on /clip, so only to an approved curator.
//
// Why this lives here and not on the signed-in homepage (Daniela,
// 2026-09-24): the extension refuses any account that isn't a curator
// (app/api/extension/session), so offering it to every visitor would
// advertise a tool they can't use. It would also read as opening clipping
// to the public, which the legal note puts behind a real repeat-infringer
// policy and the paid consult. Keep it on the gated page until then.
//
// Dismissal is per browser on purpose: installing an extension is a
// per-browser act, so a curator who installed it on the laptop should
// still see this on the desktop. It is read through useSyncExternalStore
// rather than an effect, so the server renders nothing and the card
// appears after hydration instead of flashing and disappearing.

const DISMISSED = "04am_clipper_card_dismissed";
const DOWNLOAD = "/clipper/04am-clipper-chrome.zip";
const UNKNOWN = "\u0000server";

const STEPS = [
  "Download the folder and unzip it.",
  "Open chrome://extensions and turn on Developer mode.",
  "Click Load unpacked and choose the unzipped 04am-clipper folder.",
];

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab dismissing it should settle this one too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(): string | null {
  try {
    return localStorage.getItem(DISMISSED);
  } catch {
    // A private window has no store; the card simply always shows.
    return null;
  }
}

export function ClipperInstall({ version }: { version: string }) {
  const dismissedFor = useSyncExternalStore(subscribe, read, () => UNKNOWN);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED, version);
    } catch {
      // Nothing to remember it with; hiding it for this render is enough.
    }
    for (const l of listeners) l();
  }

  if (dismissedFor === UNKNOWN || dismissedFor === version) return null;

  return (
    <section className="border border-white/10 bg-ink-2 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-bone/70">
          Clip from anywhere
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-bone/60 underline underline-offset-4 hover:text-bone"
        >
          Hide this
        </button>
      </div>

      <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-bone/85">
        The 04AM Clipper puts the library one right-click away. On any page,
        pick an image and it arrives here credited, classified and whole —
        linked to the original, never copied.
      </p>

      <ol className="mt-5 flex max-w-[52ch] flex-col gap-2">
        {STEPS.map((step, i) => (
          <li key={step} className="flex gap-3 text-[14px] text-bone/80">
            <span className="w-4 shrink-0 tabular-nums text-bone/45">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <a
          href={DOWNLOAD}
          download
          className="inline-flex h-11 items-center rounded-[4px] bg-bone px-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-white"
        >
          Download for Chrome
        </a>
        <span className="text-xs text-bone/60">Version {version} · Chrome and Edge</span>
      </div>

      <p className="mt-5 max-w-[52ch] text-xs leading-relaxed text-bone/60">
        Developer mode is how Chrome installs an extension that isn&rsquo;t in
        its store yet. Once 04AM&rsquo;s listing is live this becomes one
        click, and the extension updates itself.
      </p>
    </section>
  );
}
