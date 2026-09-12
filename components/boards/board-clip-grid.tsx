"use client";

import { useState } from "react";
import { moveClipOnBoard } from "@/app/boards/actions";
import { HomeGrid, type GridClip } from "@/components/home-grid";
import { ClipThumbnail } from "@/components/clip-thumbnail";

// A board's clips, with an owner-only "Rearrange" mode. Viewing is the
// normal masonry (HomeGrid) — good for browsing, bad for dragging: DOM
// order runs down one column before the next, so visually-adjacent tiles
// in different columns aren't adjacent to drag between. Rearrange mode
// switches to a uniform grid instead, where each tile's row/column slot
// is predictable.
//
// Every drop calls moveClipOnBoard and updates local order optimistically,
// rolling back only if the action errors. Move left/right buttons call
// the exact same action with the exact same neighbours a drag would
// compute, so keyboard users get the same ordering guarantees.
export function BoardClipGrid({
  boardId,
  canRearrange,
  initialClips,
}: {
  boardId: string;
  /** Owner-only, and only when no search is filtering the board. */
  canRearrange: boolean;
  initialClips: GridClip[];
}) {
  const [rearranging, setRearranging] = useState(false);
  const [clips, setClips] = useState(initialClips);
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

  if (!canRearrange) return <HomeGrid clips={clips} emptyText={null} />;

  return (
    <>
      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRearranging((r) => !r)}
            className="rounded border border-white/25 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-bone/85 transition-colors hover:border-white/45 hover:text-bone"
          >
            {rearranging ? "Done" : "Rearrange"}
          </button>
          {rearranging && (
            <p className="text-xs text-bone/60">
              Drag a tile, or use the arrows. Every drop saves right away.
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>

      {rearranging ? (
        <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8 pb-24">
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {clips.map((clip, i) => (
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
            ))}
          </div>
        </div>
      ) : (
        <HomeGrid clips={clips} emptyText={null} />
      )}
    </>
  );
}
