"use client";

import { useActionState } from "react";
import { describeClipsForSearch } from "./describe-actions";

export function DescribeButton({ eligibleCount }: { eligibleCount: number }) {
  const [state, action, pending] = useActionState(describeClipsForSearch, undefined);

  if (eligibleCount === 0 && !state) {
    return (
      <p className="text-sm opacity-70">Every clip is described for search.</p>
    );
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
          ? "Describing the first clip…"
          : `Describe ${batchSize} of ${eligibleCount} clip${eligibleCount === 1 ? "" : "s"} for search`}
      </button>
      <p className="max-w-md text-xs opacity-70">
        Claude looks at each image and writes what&rsquo;s in it, so a search for
        &ldquo;film photography&rdquo; finds every film photograph. Search uses it;
        nobody sees it. Tags aren&rsquo;t touched, so no figure moves. About 2 cents
        per clip in API credits.
      </p>
      {state?.error && (
        <p role="alert" className="max-w-md text-sm text-bone">
          {state.error}
        </p>
      )}
      {state?.startedCount !== undefined && (
        <p className="max-w-md text-sm opacity-80">
          {state.startedCount === 0 && state.parked === 0
            ? "Nothing left to describe."
            : `First clip got ${state.firstKeywords} keywords. The other ${Math.max(state.startedCount - 1, 0)} are being described in the background. Refresh, then click again for the next batch.`}
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
