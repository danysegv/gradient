// The line under the search bar: what was searched and what came back.
export function SearchSummary({
  q,
  clipCount,
  boardCount,
  exact,
  scope,
}: {
  q: string;
  clipCount: number;
  boardCount: number | null;
  exact: boolean;
  scope: string;
}) {
  const nothing = clipCount === 0 && (boardCount ?? 0) === 0;
  return (
    <div className="mt-3 flex flex-col gap-1" aria-live="polite">
      <p className="text-[13px] text-bone/75">
        {nothing ? (
          <>Nothing {scope} matches &ldquo;{q}&rdquo;.</>
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
            )}{" "}
            for &ldquo;{q}&rdquo;
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
