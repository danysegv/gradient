"use client";

import { useActionState } from "react";
import { backfillIncubatingTags } from "./backfill-actions";

export function BackfillButton({ eligibleCount }: { eligibleCount: number }) {
  const [state, action, pending] = useActionState(
    backfillIncubatingTags,
    undefined
  );

  if (eligibleCount === 0 && !state) {
    return (
      <p className="text-sm opacity-70">
        Every clip carries the new vocabulary.
      </p>
    );
  }

  const batchSize = Math.min(eligibleCount, 20);

  return (
    <form action={action} className="flex flex-col gap-2 items-start">
      <button
        disabled={pending || eligibleCount === 0}
        type="submit"
        className="border rounded px-3 py-2 disabled:opacity-50"
      >
        {pending
          ? "Starting…"
          : `Apply new vocabulary to ${batchSize} of ${eligibleCount} clip${eligibleCount === 1 ? "" : "s"}`}
      </button>
      <p className="max-w-md text-xs opacity-70">
        Adds only the incubating tags. Nothing already on a clip is changed
        or removed, so no published figure moves.
      </p>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.startedCount !== undefined && (
        <p className="text-sm text-green-700">
          {state.startedCount === 0
            ? "Nothing left to backfill."
            : `Started — ${state.startedCount} clip${state.startedCount === 1 ? "" : "s"} processing in the background. Refresh in a bit, then click again for the next batch.`}
        </p>
      )}
    </form>
  );
}
