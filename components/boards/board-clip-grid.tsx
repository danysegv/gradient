"use client";

import { useState } from "react";
import { moveClipOnBoard, setBoardCover } from "@/app/boards/actions";
import { HomeGrid, type GridClip } from "@/components/home-grid";
import { ClipThumbnail } from "@/components/clip-thumbnail";
import { COVER_COUNT } from "@/lib/boards/cover";

// A board's clips, with two owner-only modes.
//
// Rearrange: viewing is the normal masonry (HomeGrid) — good for browsing,
// bad for dragging, since DOM order runs down one column before the next
// and visually-adjacent tiles in different columns aren't adjacent to drag
// between. Rearrange switches to a uniform grid where each tile's slot is
// predictable. Every drop calls moveClipOnBoard and updates local order
// optimistically, rolling back only if the action errors. Move left/right
// call the same action with the same neighbours a drag would compute, so
// keyboard users get the same ordering guarantees.
//
// Cover: pick up to four clips, in the order picked. Picking nothing means
// the default — the first four in board order, which then follows the board
// whenever it's rearranged. Both modes use the same uniform grid, because
// in both the question is "which tile is where", not "how does this read".
type Mode = "idle" | "rearrange" | "cover";

export function BoardClipGrid({
  boardId,
  canRearrange,
  initialClips,
  initialCoverClipIds,
}: {
  boardId: string;
  /** Owner-only, and only when no search is filtering the board. */
  canRearrange: boolean;
  initialClips: GridClip[];
  /** Null means the board is on the default cover. */
  initialCoverClipIds: string[] | null;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [clips, setClips] = useState(initialClips);
  const [cover, setCover] = useState<string[]>(initialCoverClipIds ?? []);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(
    clipId: string,
    beforeId: string | null,
    afterId: string | null
  ) {
    const prev = clips;
    const moved = prev.find((c) => c.id === clipId);
    if (!moved) return;
    const withoutMoved = prev.filter((c) => c.id !== clipId);
    const insertAt = afterId
      ? withoutMoved.findIndex((c) => c.id === afterId)
      : withoutMoved.length;
    const idx = insertAt === -1 ? withoutMoved.length : insertAt;
    const next = [...withoutMoved.slice(0, idx), moved, ...withoutMoved.slice(idx)];

    setClips(next);
    setError(null);
    const result = await moveClipOnBoard(boardId, clipId, beforeId, afterId);
    if (result?.error) {
      setClips(prev);
      setError(result.error);
    }
  }

  function moveBy(clipId: string, direction: -1 | 1) {
    const i = clips.findIndex((c) => c.id === clipId);
    if (i === -1) return;
    const j = i + direction;
    if (j < 0 || j >= clips.length) return;
    if (direction === -1) {
      move(clipId, clips[i - 2]?.id ?? null, clips[i - 1].id);
    } else {
      move(clipId, clips[i + 1].id, clips[i + 2]?.id ?? null);
    }
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const withoutDragged = clips.filter((c) => c.id !== draggedId);
    const targetIndex = withoutDragged.findIndex((c) => c.id === targetId);
    const beforeId = withoutDragged[targetIndex - 1]?.id ?? null;
    move(draggedId, beforeId, targetId);
    setDraggedId(null);
  }

  // Saves the whole chosen list every time, so the stored order is always
  // exactly what the numbers on screen say.
  async function saveCover(next: string[]) {
    const prev = cover;
    setCover(next);
    setError(null);
    const result = await setBoardCover(boardId, next.length > 0 ? next : null);
    if (result?.error) {
      setCover(prev);
      setError(result.error);
    }
  }

  function toggleCover(clipId: string) {
    const at = cover.indexOf(clipId);
    if (at !== -1) {
      saveCover(cover.filter((id) => id !== clipId));
      return;
    }
    if (cover.length >= COVER_COUNT) return;
    saveCover([...cover, clipId]);
  }

  if (!canRearrange) return <HomeGrid clips={clips} emptyText={null} />;

  const buttonClass =
    "rounded border border-white/25 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-bone/85 transition-colors hover:border-white/45 hover:text-bone";

  return (
    <>
      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setMode((m) => (m === "rearrange" ? "idle" : "rearrange"))}
            className={buttonClass}
          >
            {mode === "rearrange" ? "Done" : "Rearrange"}
          </button>
          <button
            type="button"
            onClick={() => setMode((m) => (m === "cover" ? "idle" : "cover"))}
            className={buttonClass}
          >
            {mode === "cover" ? "Done" : "Cover"}
          </button>
          {mode === "rearrange" && (
            <p className="text-xs text-bone/60">
              Drag a tile, or use the arrows. Every drop saves right away.
            </p>
          )}
          {mode === "cover" && (
            <>
              <p className="text-xs text-bone/60">
                {cover.length === 0
                  ? `Pick up to ${COVER_COUNT} clips, in the order you want them. Picking none keeps the first ${COVER_COUNT} in board order.`
                  : `${cover.length} of ${COVER_COUNT} chosen, in the order shown.`}
              </p>
              {cover.length > 0 && (
                <button
                  type="button"
                  onClick={() => saveCover([])}
                  className="text-[11px] font-semibold uppercase tracking-wide text-bone/70 underline underline-offset-4 hover:text-bone"
                >
                  Use default
                </button>
              )}
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>

      {mode === "idle" ? (
        <HomeGrid clips={clips} emptyText={null} />
      ) : (
        <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8 pb-24">
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {clips.map((clip, i) => {
              const coverIndex = cover.indexOf(clip.id);
              const chosen = coverIndex !== -1;
              const full = cover.length >= COVER_COUNT && !chosen;

              if (mode === "cover") {
                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => toggleCover(clip.id)}
                    disabled={full}
                    aria-pressed={chosen}
                    aria-label={
                      chosen
                        ? `Remove "${clip.title || clip.url}" from the cover (currently ${coverIndex + 1})`
                        : `Add "${clip.title || clip.url}" to the cover`
                    }
                    className={`relative flex flex-col gap-1.5 rounded-[3px] text-left transition-opacity ${
                      full ? "cursor-not-allowed opacity-30" : "hover:opacity-90"
                    }`}
                  >
                    <ClipThumbnail
                      imageUrl={clip.image_url}
                      title={clip.title}
                      source={clip.source}
                    />
                    <span
                      aria-hidden
                      className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                        chosen
                          ? "bg-bone text-ink"
                          : "border border-white/40 bg-ink/60 text-transparent"
                      }`}
                    >
                      {chosen ? coverIndex + 1 : "0"}
                    </span>
                  </button>
                );
              }

              return (
                <div
                  key={clip.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggedId(clip.id);
                    e.dataTransfer.setData("text/plain", clip.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(clip.id);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  className={`flex flex-col gap-1.5 overflow-hidden rounded-[3px] transition-opacity ${
                    draggedId === clip.id ? "opacity-40" : ""
                  }`}
                >
                  <ClipThumbnail
                    imageUrl={clip.image_url}
                    title={clip.title}
                    source={clip.source}
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => moveBy(clip.id, -1)}
                      disabled={i === 0}
                      aria-label={`Move "${clip.title || clip.url}" left`}
                      className="rounded border border-white/20 px-2 py-1 text-xs text-bone/80 transition-colors hover:border-white/40 hover:text-bone disabled:pointer-events-none disabled:opacity-30"
                    >
                      ‹ Move left
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBy(clip.id, 1)}
                      disabled={i === clips.length - 1}
                      aria-label={`Move "${clip.title || clip.url}" right`}
                      className="rounded border border-white/20 px-2 py-1 text-xs text-bone/80 transition-colors hover:border-white/40 hover:text-bone disabled:pointer-events-none disabled:opacity-30"
                    >
                      Move right ›
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
