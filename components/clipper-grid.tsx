"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ClipThumbnail } from "./clip-thumbnail";
import { archiveClip, unarchiveClip } from "@/app/clip/archive-actions";

// Display order matches the taxonomy doc's section headings.
const AXES: { key: string; label: string }[] = [
  { key: "movement", label: "Movements" },
  { key: "typography", label: "Typography" },
  { key: "palette_light", label: "Palette & Light" },
  { key: "layout", label: "Layout" },
  { key: "format_motion", label: "Format & Motion" },
  { key: "treatment", label: "Treatment" },
];

// The toast is a convenience, not the safety net — the Archived view is.
// 15s is long enough to catch a genuine misclick without parking a panel
// over the grid indefinitely.
const UNDO_WINDOW_MS = 15000;

const SCRIM =
  "linear-gradient(to top, rgba(11,10,14,0.97) 0%, rgba(11,10,14,0.88) 32%, rgba(11,10,14,0.55) 62%, rgba(11,10,14,0) 92%)";

export type ClipperClip = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  clipped_at: string;
  clippedByName: string | null;
  needsImage: boolean;
  badImageUrl: boolean;
  tagsByAxis: {
    group: string;
    tags: { editorial_name: string; confidence: number }[];
  }[];
};

function byClippedAtDesc(a: ClipperClip, b: ClipperClip) {
  return new Date(b.clipped_at).getTime() - new Date(a.clipped_at).getTime();
}

function ClipCard({
  clip,
  action,
}: {
  clip: ClipperClip;
  action: { label: string; onClick: () => void };
}) {
  return (
    <div className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[3px]">
      {/* Opens the clip, not the source host — same rule as the public
          grid. In the clipper it is the more useful destination anyway:
          reviewing a fresh clip means checking what the classifier read
          off it, and the detail page shows every trait plus the credit
          block. The source is one click further, as a labelled button. */}
      <Link href={`/clip/${clip.id}`} className="block">
        <ClipThumbnail
          imageUrl={clip.image_url}
          title={clip.title}
          source={clip.source}
        />
      </Link>

      {/* Always visible — spotting bad clips while scanning is the
          clipper's job, not gated behind hover. */}
      {(clip.needsImage || clip.badImageUrl) && (
        <div className="pointer-events-none absolute left-1.5 top-1.5 flex flex-col gap-1">
          {clip.needsImage && (
            <span className="rounded bg-ink/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
              Needs image
            </span>
          )}
          {clip.badImageUrl && (
            <span className="rounded bg-ink/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
              Bad image URL
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={action.onClick}
        className="absolute right-1.5 top-1.5 rounded bg-ink/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-bone opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        {action.label}
      </button>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end p-2.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{ background: SCRIM }}
      >
        <p className="mb-0.5 text-xs font-semibold leading-snug text-bone">
          {clip.title || clip.url}
        </p>
        {(clip.source || clip.clippedByName) && (
          <p className="mb-1.5 text-[11px] text-bone/75">
            {[clip.source, clip.clippedByName].filter(Boolean).join(" · ")}
          </p>
        )}
        {clip.tagsByAxis.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {AXES.filter((axis) =>
              clip.tagsByAxis.some((a) => a.group === axis.key)
            ).map((axis) => {
              const group = clip.tagsByAxis.find((a) => a.group === axis.key)!;
              return (
                <li key={axis.key} className="text-[10px] text-bone/85">
                  <span className="text-bone/70">{axis.label}:</span>{" "}
                  {group.tags
                    .map(
                      (t) =>
                        `${t.editorial_name} (${Math.round(t.confidence * 100)}%)`
                    )
                    .join(", ")}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ClipperGrid({
  initialClips,
  initialArchived = [],
}: {
  initialClips: ClipperClip[];
  initialArchived?: ClipperClip[];
}) {
  const [clips, setClips] = useState(initialClips);
  const [archived, setArchived] = useState(initialArchived);
  const [view, setView] = useState<"library" | "archived">("library");
  const [pendingUndo, setPendingUndo] = useState<ClipperClip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearUndoTimer() {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  }

  // Both lists stay sorted the same way, so a clip lands back exactly
  // where it was regardless of which direction it moved.
  function moveToArchived(clip: ClipperClip) {
    setClips((prev) => prev.filter((c) => c.id !== clip.id));
    setArchived((prev) => [...prev, clip].sort(byClippedAtDesc));
  }

  function moveToLibrary(clip: ClipperClip) {
    setArchived((prev) => prev.filter((c) => c.id !== clip.id));
    setClips((prev) => [...prev, clip].sort(byClippedAtDesc));
  }

  async function handleArchive(clip: ClipperClip) {
    setError(null);
    clearUndoTimer();
    // Optimistic: move immediately and start the undo window without
    // waiting on the network — a failure rolls it back.
    moveToArchived(clip);
    setPendingUndo(clip);
    undoTimeoutRef.current = setTimeout(() => {
      setPendingUndo((p) => (p?.id === clip.id ? null : p));
    }, UNDO_WINDOW_MS);

    const result = await archiveClip(clip.id);
    if (result?.error) {
      clearUndoTimer();
      setPendingUndo((p) => (p?.id === clip.id ? null : p));
      moveToLibrary(clip);
      setError(`Couldn't archive "${clip.title || clip.url}": ${result.error}`);
    }
  }

  async function handleRestore(clip: ClipperClip) {
    setError(null);
    clearUndoTimer();
    setPendingUndo(null);
    moveToLibrary(clip);

    const result = await unarchiveClip(clip.id);
    if (result?.error) {
      moveToArchived(clip);
      setError(
        `Couldn't restore "${clip.title || clip.url}": ${result.error}`
      );
    }
  }

  const shown = view === "library" ? clips : archived;

  return (
    <div className="relative">
      <div className="mb-4 flex items-center gap-2 px-2">
        {(
          [
            ["library", "Library", clips.length],
            ["archived", "Archived", archived.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              view === key
                ? "border-bone bg-bone text-ink"
                : "border-white/20 text-bone/75 hover:border-white/40 hover:text-bone"
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-3 px-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="px-2 text-sm text-bone/70">
          {view === "library" ? "No clips yet." : "Nothing archived."}
        </p>
      ) : (
        <div className="columns-2 gap-4 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6">
          {shown.map((clip) =>
            view === "library" ? (
              <ClipCard
                key={clip.id}
                clip={clip}
                action={{ label: "Archive", onClick: () => handleArchive(clip) }}
              />
            ) : (
              <ClipCard
                key={clip.id}
                clip={clip}
                action={{ label: "Restore", onClick: () => handleRestore(clip) }}
              />
            )
          )}
        </div>
      )}

      {pendingUndo && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-white/10 bg-ink-2 px-4 py-3 text-sm shadow-lg"
        >
          <span className="text-bone">
            Archived &ldquo;{pendingUndo.title || pendingUndo.url}&rdquo;
          </span>
          <button
            type="button"
            onClick={() => handleRestore(pendingUndo)}
            className="rounded border border-bone/50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-bone transition-colors hover:bg-bone hover:text-ink"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
