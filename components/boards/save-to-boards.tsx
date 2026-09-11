"use client";

import Link from "next/link";
import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  createBoard,
  setClipOnBoard,
  type BoardFormState,
} from "@/app/boards/actions";
import type { BoardChoice } from "@/lib/boards/queries";
import { TITLE_MAX } from "@/lib/boards/input";

// On a clip page, for a signed-in curator: tick the boards this clip
// belongs on. Any clip in the library can go on your boards; it stays
// credited to whoever clipped it. Ticking never re-tags or re-counts the
// clip — a board only points at it.
export function SaveToBoards({
  clipId,
  ownerName,
  boards,
}: {
  clipId: string;
  ownerName: string;
  boards: BoardChoice[];
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    boards,
    (current, change: { id: string; has: boolean }) =>
      current.map((b) => (b.id === change.id ? { ...b, has: change.has } : b))
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, createAction, creating] = useActionState<BoardFormState, FormData>(
    createBoard,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  function toggle(board: BoardChoice) {
    const has = !board.has;
    setError(null);
    startTransition(async () => {
      setOptimistic({ id: board.id, has });
      const result = await setClipOnBoard(board.id, clipId, has);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {optimistic.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {optimistic.map((b) => (
            <li key={b.id}>
              <label
                htmlFor={`board-${b.id}`}
                className="flex cursor-pointer items-baseline gap-2.5 text-[14px]"
              >
                <input
                  id={`board-${b.id}`}
                  type="checkbox"
                  checked={b.has}
                  onChange={() => toggle(b)}
                  className="h-4 w-4 translate-y-[2px] accent-[#E7E3D8]"
                />
                <span className="text-bone">{b.title}</span>
                {!b.is_public && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-bone/60">
                    Private
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-bone/70">
          No boards yet. Name one below and this clip goes straight in.
        </p>
      )}

      {error && (
        <p role="alert" className="text-[13px] text-bone">
          {error}
        </p>
      )}

      <form ref={formRef} action={createAction} className="flex gap-2">
        <input type="hidden" name="clip_id" value={clipId} />
        <label htmlFor="quick-board-title" className="sr-only">
          New board title
        </label>
        <input
          id="quick-board-title"
          name="title"
          required
          maxLength={TITLE_MAX}
          placeholder="New board"
          className="min-w-0 flex-1 rounded-[3px] border border-white/15 bg-ink-2 px-3 py-1.5 text-[13px] text-bone placeholder:text-bone/50 focus:border-bone/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded border border-white/25 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-bone hover:border-white/50 disabled:opacity-60"
        >
          {creating ? "Adding…" : "Add"}
        </button>
      </form>
      {state?.error && (
        <p role="alert" className="text-[13px] text-bone">
          {state.error}
        </p>
      )}
      <p className="text-[11px] text-bone/60">
        New boards start private.{" "}
        <Link
          href={`/curator/${encodeURIComponent(ownerName)}`}
          className="underline underline-offset-4 hover:text-bone"
        >
          All your boards
        </Link>
      </p>
    </div>
  );
}
