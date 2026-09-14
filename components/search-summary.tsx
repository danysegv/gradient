import { COLOR_BUCKETS, type ColorBucket } from "@/lib/color/buckets";

// The line under the search bar: what was searched and what came back.
//
// A colour is not a word, so it never goes inside the quotes. "Nothing
// matches ''" is what you get when an empty query is rendered as though it
// were the search — which is exactly what a swatch with no text typed is.
export function SearchSummary({
  q,
  color = null,
  colorsReady = true,
  clipCount,
  boardCount,
  exact,
  scope,
}: {
  q: string;
  /** The swatch applied, if any. */
  color?: ColorBucket | null;
  /** False when no clip has had its colours read yet. */
  colorsReady?: boolean;
  clipCount: number;
  boardCount: number | null;
  exact: boolean;
  scope: string;
}) {
  const nothing = clipCount === 0 && (boardCount ?? 0) === 0;
  const label = color
    ? (COLOR_BUCKETS.find((b) => b.id === color)?.label ?? color).toLowerCase()
    : null;

  // Saying "nothing is yellow" when nothing has been looked at yet is a
  // claim about the library that isn't true.
  if (color && nothing && !colorsReady) {
    return (
      <div className="mt-3 flex flex-col gap-1" aria-live="polite">
        <p className="text-[13px] text-bone/75">
          Colour search isn&rsquo;t ready yet — no clip has had its colours
          read.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-1" aria-live="polite">
      <p className="text-[13px] text-bone/75">
        {nothing ? (
          q ? (
            <>
              Nothing {scope} matches &ldquo;{q}&rdquo;
              {label && <> in {label}</>}.
            </>
          ) : (
            <>Nothing {scope} is {label}.</>
          )
        ) : (
          <>
            <span className="font-normal tabular-nums">{clipCount}</span>{" "}
            {clipCount === 1 ? "clip" : "clips"}
            {boardCount !== null && (
              <>
                {" "}·{" "}
                <span className="font-normal tabular-nums">{boardCount}</span>{" "}
                {boardCount === 1 ? "board" : "boards"}
              </>
            )}
            {q && <> for &ldquo;{q}&rdquo;</>}
            {label && <> in {label}</>}
          </>
        )}
      </p>
      {!exact && clipCount > 0 && (
        <p className="text-[12px] text-bone/60">
          No clip matches every word, so these match at least one of them.
        </p>
      )}
    </div>
  );
}
