"use client";

import { useState, useTransition } from "react";
import { updateCaption } from "@/app/clip/caption-actions";
import { MAX_CAPTION } from "@/lib/clips/caption";

// The caption under a clip's title, editable by the curator who clipped it
// (or an admin). Quiet until asked: a small "Edit caption" beneath the
// text, then the same textarea as the clip form, Save and Cancel.
export function CaptionEditor({ clipId, initial }: { clipId: string; initial: string | null }) {
  const [caption, setCaption] = useState(initial);
  const [draft, setDraft] = useState(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const res = await updateCaption(clipId, draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCaption(res.caption);
      setDraft(res.caption ?? "");
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="mt-3">
        {caption && <p className="whitespace-pre-line text-[14px] leading-relaxed text-bone/75">{caption}</p>}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`${caption ? "mt-2" : ""} text-[11px] font-semibold uppercase tracking-wide text-bone/55 underline-offset-4 hover:text-bone hover:underline`}
        >
          {caption ? "Edit caption" : "Add a caption"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <label htmlFor={`caption-${clipId}`} className="sr-only">
        Caption
      </label>
      <textarea
        id={`caption-${clipId}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={MAX_CAPTION}
        rows={4}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(caption ?? "");
            setEditing(false);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        }}
        className="w-full resize-y rounded-[3px] border border-white/15 bg-ink px-3 py-2.5 text-[14px] leading-relaxed text-bone placeholder:text-bone/35 focus:border-bone/50 focus:outline-none"
        placeholder="What you want people to notice"
      />
      <div className="mt-2.5 flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-9 rounded-[3px] bg-bone px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(caption ?? "");
            setError(null);
            setEditing(false);
          }}
          disabled={pending}
          className="text-[11px] font-semibold uppercase tracking-wide text-bone/60 hover:text-bone"
        >
          Cancel
        </button>
        <span className="ml-auto text-[11px] tabular-nums text-bone/40">
          {draft.length > MAX_CAPTION - 500 ? `${MAX_CAPTION - draft.length} left` : ""}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-bone/80">
          {error}
        </p>
      )}
    </div>
  );
}
