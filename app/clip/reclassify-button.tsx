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
          ? "Classifying the first clip…"
          : `Apply new vocabulary to ${batchSize} of ${eligibleCount} clip${eligibleCount === 1 ? "" : "s"}`}
      </button>
      <p className="max-w-md text-xs opacity-70">
        Adds only the incubating tags, to every clip missing them — including
        the ones never classified at all. Nothing already on a clip is changed
        or removed, so no published figure moves.
      </p>
      {state?.error && (
        <p role="alert" className="max-w-md text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.startedCount !== undefined && (
        <p className="max-w-md text-sm text-green-700">
          {state.startedCount === 0
            ? "Nothing left to apply."
            : `First clip wrote ${state.firstTags} tag${state.firstTags === 1 ? "" : "s"} — the other ${state.startedCount - 1} are processing in the background. Refresh, then click again for the next batch.`}
        </p>
      )}
    </form>
  );
}
