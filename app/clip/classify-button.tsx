"use client";

import { useActionState } from "react";
import { classifyClips } from "./classify-actions";

function describeBreakdown(fullCount: number, incubatingCount: number): string {
  const parts: string[] = [];
  if (fullCount > 0) parts.push(`${fullCount} never classified`);
  if (incubatingCount > 0) parts.push(`${incubatingCount} missing new vocabulary`);
  return parts.join(", ");
}

export function ClassifyButton({
  fullCount,
  incubatingCount,
}: {
  fullCount: number;
  incubatingCount: number;
}) {
  const [state, action, pending] = useActionState(classifyClips, undefined);

  const eligibleCount = fullCount + incubatingCount;

  if (eligibleCount === 0 && !state) {
    return <p className="text-sm opacity-70">Every clip is fully classified.</p>;
  }

  const batchSize = Math.min(eligibleCount, 20);
  const breakdown = describeBreakdown(fullCount, incubatingCount);

  return (
    <form action={action} className="flex flex-col gap-2 items-start">
      <button
        disabled={pending || eligibleCount === 0}
        type="submit"
        className="border rounded px-3 py-2 disabled:opacity-50"
      >
        {pending
          ? "Classifying the first clip…"
          : `Classify ${batchSize} of ${eligibleCount} clip${eligibleCount === 1 ? "" : "s"}`}
      </button>
      {breakdown && <p className="max-w-md text-xs opacity-70">{breakdown}</p>}
      <p className="max-w-md text-xs opacity-70">
        Clips missing a published tag get the full classifier; clips that
        already have one but are missing new vocabulary only get the
        incubating top-up. Nothing already on a clip is changed or removed,
        so no published figure moves.
      </p>
      {state?.error && (
        <p role="alert" className="max-w-md text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.startedCount !== undefined && (
        <p className="max-w-md text-sm text-green-700">
          {state.startedCount === 0 && state.parked === 0
            ? "Nothing left to classify."
            : `First clip wrote ${state.firstTags} tag${state.firstTags === 1 ? "" : "s"} — the other ${Math.max(state.startedCount - 1, 0)} (${describeBreakdown(state.fullCount, state.incubatingCount)}) are processing in the background. Refresh, then click again for the next batch.`}
        </p>
      )}
      {!!state?.parked && (
        <p className="max-w-md text-sm opacity-70">
          Parked {state.parked} clip{state.parked === 1 ? "" : "s"} whose image
          could not be fetched. They are out of the queue so they stop blocking
          the rest — listed below to fix.
        </p>
      )}
    </form>
  );
}
