"use client";

import { useActionState } from "react";
import { colorClipsForSearch } from "./color-actions";

export function ColorButton({ eligibleCount }: { eligibleCount: number }) {
  const [state, action, pending] = useActionState(colorClipsForSearch, undefined);

  if (eligibleCount === 0 && !state) {
    return <p className="text-sm opacity-70">Every clip has its colours read.</p>;
  }

  const batchSize = Math.min(eligibleCount, 20);

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <button
        disabled={pending || eligibleCount === 0}
        type="submit"
        className="rounded border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
      >
        {pending
          ? "Reading the first clip’s colours…"
          : `Read colours for ${batchSize} of ${eligibleCount} clip${eligibleCount === 1 ? "" : "s"}`}
      </button>
      <p className="max-w-md text-xs opacity-70">
        Claude reads the few colours that actually carry each image and files
        them under the swatches beneath the search bar. Existing descriptions
        aren&rsquo;t rewritten, so no search result changes underneath anyone.
        Tags aren&rsquo;t touched, so no figure moves.
      </p>
      {state?.error && (
        <p role="alert" className="max-w-md text-sm text-bone">
          {state.error}
        </p>
      )}
      {state?.startedCount !== undefined && (
        <p className="max-w-md text-sm opacity-80">
          {state.startedCount === 0 && state.parked === 0
            ? "Nothing left to read."
            : `First clip got ${state.firstColors} colour${state.firstColors === 1 ? "" : "s"}. The other ${Math.max(state.startedCount - 1, 0)} are being read in the background. Refresh, then click again for the next batch.`}
        </p>
      )}
      {!!state?.parked && (
        <p className="max-w-md text-sm opacity-70">
          Parked {state.parked} clip{state.parked === 1 ? "" : "s"} whose image
          couldn&rsquo;t be fetched. They&rsquo;re listed below to fix.
        </p>
      )}
    </form>
  );
}
