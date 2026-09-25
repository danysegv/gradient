"use client";

import { useActionState } from "react";
import { processClips } from "./process-actions";

// One button for the whole pipeline. The breakdown underneath says what
// the batch will actually spend a call on, because the two calls cost very
// different amounts: tagging runs on Opus at roughly 5-8c a clip, while a
// description and its colours come back from one Haiku call for well under
// a cent. Twenty clips to describe is pocket change; twenty to tag is not.
export function ProcessButton({
  totalCount,
  classifyCount,
  describeCount,
  awaitingColourReader,
}: {
  totalCount: number;
  classifyCount: number;
  describeCount: number;
  awaitingColourReader: number;
}) {
  const [state, action, pending] = useActionState(processClips, undefined);

  // Colours are deliberately not part of "fully processed" — they cost
  // nothing and arrive on their own. Surfaced separately so a stalled
  // watcher is visible without ever reading as work this button can do.
  const colourNote =
    awaitingColourReader > 0 ? (
      <p className="text-xs text-bone/55">
        {awaitingColourReader} clip{awaitingColourReader === 1 ? "" : "s"} waiting
        on the colour reader — free, and usually done within fifteen minutes.
      </p>
    ) : null;

  if (totalCount === 0 && !state) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-bone/70">Processing</p>
        <p className="text-[15px] text-bone/80">Every clip is fully read.</p>
        {colourNote}
      </div>
    );
  }

  const batchSize = Math.min(totalCount, 20);
  const parts = [
    classifyCount > 0 ? `${classifyCount} to tag` : null,
    describeCount > 0 ? `${describeCount} to describe` : null,
  ].filter(Boolean);

  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-bone/70">Processing</p>
      <button
        disabled={pending || totalCount === 0}
        type="submit"
        className="h-12 rounded-[4px] border border-bone/60 px-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-bone transition-colors hover:bg-bone hover:text-ink disabled:opacity-50"
      >
        {pending
          ? "Processing the first clip…"
          : `Process ${batchSize} of ${totalCount} clip${totalCount === 1 ? "" : "s"}`}
      </button>
      <p className="max-w-md text-[13px] leading-relaxed text-bone/60">
        {parts.length > 0 ? `${parts.join(" · ")}. ` : ""}
        Each clip gets whatever it&rsquo;s missing: tags against the frozen
        vocabulary, and one Haiku call that writes both its search description
        and its colours. Tagging is the expensive part — roughly 5&ndash;8&cent; a
        clip on Opus; describing and colouring together cost well under a cent.
      </p>
      {state?.error && (
        <p role="alert" className="max-w-md text-sm text-bone">
          {state.error}
        </p>
      )}
      {state?.startedCount !== undefined && (
        <p className="max-w-md text-[14px] text-bone/80">
          {state.startedCount === 0 && state.parked === 0
            ? "Nothing left to process."
            : `First clip done. The other ${Math.max(state.startedCount - 1, 0)} are processing in the background${state.remaining > 0 ? `, with ${state.remaining} still queued after this batch` : ""}. Refresh, then click again.`}
        </p>
      )}
      {!!state?.parked && (
        <p className="max-w-md text-[14px] text-bone/65">
          Parked {state.parked} clip{state.parked === 1 ? "" : "s"} whose image
          couldn&rsquo;t be fetched. They&rsquo;re listed below to fix.
        </p>
      )}
      {colourNote}
    </form>
  );
}
