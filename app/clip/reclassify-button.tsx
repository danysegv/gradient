"use client";

import { useActionState } from "react";
import { reclassifyUnclassifiedClips } from "./reclassify-actions";

export function ReclassifyButton({
  eligibleCount,
}: {
  eligibleCount: number;
}) {
  const [state, action, pending] = useActionState(
    reclassifyUnclassifiedClips,
    undefined
  );

  if (eligibleCount === 0 && !state) {
    return (
      <p className="text-sm opacity-70">Nothing unclassified right now.</p>
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
          : `Reclassify ${batchSize} of ${eligibleCount} unclassified clip${eligibleCount === 1 ? "" : "s"}`}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.startedCount !== undefined && (
        <p className="text-sm text-green-700">
          {state.startedCount === 0
            ? "Nothing to reclassify."
            : `Started — ${state.startedCount} clip${state.startedCount === 1 ? "" : "s"} processing in the background. Refresh in a bit to see results.`}
        </p>
      )}
    </form>
  );
}
