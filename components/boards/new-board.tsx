"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBoard, type BoardFormState } from "@/app/boards/actions";
import { BoardFields } from "./board-fields";

// The "New board" tile on the owner's own profile. Creating a board opens
// it, since the next thing anyone does with an empty board is look at it.
export function NewBoard({ ownerName }: { ownerName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<BoardFormState, FormData>(
    createBoard,
    undefined
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      router.push(
        `/curator/${encodeURIComponent(ownerName)}/boards/${encodeURIComponent(state.slug)}`
      );
    }
  }, [state, ownerName, router]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-[3px] border border-dashed border-white/20 text-bone/75 transition-colors hover:border-white/40 hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bone"
      >
        <span className="text-[22px] font-normal leading-none">+</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          New board
        </span>
      </button>
    );
  }

  return (
    <form
      action={action}
      className="col-span-2 flex flex-col gap-4 rounded-[3px] border border-white/15 bg-ink-2 p-5 sm:col-span-2"
    >
      <BoardFields idPrefix="new-board" />
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
          {pending ? "Creating…" : "Create board"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] font-semibold uppercase tracking-wide text-bone/70 hover:text-bone"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
