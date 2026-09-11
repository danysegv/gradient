"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteBoard,
  updateBoard,
  type BoardFormState,
} from "@/app/boards/actions";
import { BoardFields } from "./board-fields";

// Edit and delete, shown only to the board's owner. Delete asks in place
// rather than through a browser dialog, and says exactly what it removes.
export function BoardOwnerControls({
  board,
}: {
  board: {
    id: string;
    title: string;
    description: string | null;
    is_public: boolean;
    clipCount: number;
  };
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "confirm-delete">("idle");
  const [state, action, pending] = useActionState<BoardFormState, FormData>(
    async (prev, formData) => {
      const result = await updateBoard(prev, formData);
      if (result?.ok) setMode("idle");
      return result;
    },
    undefined
  );
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const linkClass =
    "text-[11px] font-semibold uppercase tracking-wide text-bone/70 underline underline-offset-4 hover:text-bone";

  if (mode === "edit") {
    return (
      <form
        action={action}
        className="mt-6 flex max-w-xl flex-col gap-4 rounded-[3px] border border-white/15 bg-ink-2 p-5"
      >
        <input type="hidden" name="board_id" value={board.id} />
        <BoardFields
          idPrefix="edit-board"
          defaults={{
            title: board.title,
            description: board.description,
            isPublic: board.is_public,
          }}
        />
        {state?.error && (
          <p role="alert" className="text-[13px] text-bone">
            {state.error}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-oxide px-4 py-2 text-[13px] font-semibold tracking-wide text-bone disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setMode("idle")} className={linkClass}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (mode === "confirm-delete") {
    return (
      <div className="mt-6 flex max-w-xl flex-col gap-3 rounded-[3px] border border-white/15 bg-ink-2 p-5">
        <p className="text-[14px] leading-relaxed text-bone">
          Delete &ldquo;{board.title}&rdquo;? The board goes away. Its{" "}
          <span className="font-normal tabular-nums">{board.clipCount}</span>{" "}
          {board.clipCount === 1 ? "clip stays" : "clips stay"} in the library,
          with their tags.
        </p>
        {deleteError && (
          <p role="alert" className="text-[13px] text-bone">
            {deleteError}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={deleting}
            onClick={() =>
              startDelete(async () => {
                const result = await deleteBoard(board.id);
                if (result?.error) setDeleteError(result.error);
              })
            }
            className="rounded border border-oxide px-4 py-2 text-[13px] font-semibold tracking-wide text-bone disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete board"}
          </button>
          <button type="button" onClick={() => setMode("idle")} className={linkClass}>
            Keep it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 flex items-center gap-5">
      <button type="button" onClick={() => setMode("edit")} className={linkClass}>
        Edit board
      </button>
      <button
        type="button"
        onClick={() => setMode("confirm-delete")}
        className={linkClass}
      >
        Delete
      </button>
    </div>
  );
}
