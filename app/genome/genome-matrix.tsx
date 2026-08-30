"use client";

import { useState } from "react";

export type GenomeTag = {
  tagId: string;
  name: string;
  group: string;
  total: number;
  /** True when this row has too few references for its shares to mean anything. */
  earlySignal: boolean;
};

export type GenomeCell = { from: string; to: string; both: number };

const AXIS_SHORT: Record<string, string> = {
  movement: "MOV",
  typography: "TYP",
  palette_light: "PAL",
  layout: "LAY",
  format_motion: "FMT",
  treatment: "TRT",
};

// Sequential scale: one hue, light to dark. Bone at increasing opacity on
// Ink — magnitude, so it must NOT borrow Oxide or Slate, which the
// identity reserves for accelerating and cooling. Floor is high enough
// that a real relationship never reads as an empty cell.
function fill(share: number): string {
  if (share <= 0) return "transparent";
  return `rgba(231,227,216,${(0.06 + share * 0.72).toFixed(3)})`;
}

export function GenomeMatrix({
  tags,
  cells,
}: {
  tags: GenomeTag[];
  cells: GenomeCell[];
}) {
  const [hover, setHover] = useState<{
    from: GenomeTag;
    to: GenomeTag;
    both: number;
    share: number;
    x: number;
    y: number;
  } | null>(null);

  const byPair = new Map(cells.map((c) => [`${c.from}|${c.to}`, c.both]));

  return (
    <div className="relative">
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-ink-2">
        <table className="border-collapse" style={{ fontVariantNumeric: "tabular-nums" }}>
          <caption className="sr-only">
            Directed tag co-occurrence. Each row is a tag; each cell shows the
            share of that tag&rsquo;s references that also carry the column tag.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 bg-ink-2 p-0" />
              {tags.map((t) => (
                <th
                  key={t.tagId}
                  scope="col"
                  className="h-[132px] w-[34px] p-0 align-bottom"
                >
                  <div
                    className="mx-auto pb-2 text-[11px] font-normal tracking-wide text-bone/70"
                    style={{ writingMode: "vertical-rl", rotate: "180deg" }}
                  >
                    {t.name}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tags.map((from) => (
              <tr key={from.tagId}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-ink-2 py-0 pl-4 pr-3 text-left"
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`text-[13px] font-semibold ${
                        from.earlySignal ? "text-bone/45" : "text-bone"
                      }`}
                    >
                      {from.name}
                    </span>
                    <span className="text-[10px] tracking-wide text-bone/40">
                      {AXIS_SHORT[from.group] ?? from.group}
                    </span>
                    <span className="text-[11px] text-bone/50">{from.total}</span>
                  </span>
                </th>
                {tags.map((to) => {
                  const self = from.tagId === to.tagId;
                  const both = byPair.get(`${from.tagId}|${to.tagId}`) ?? 0;
                  const share = self || from.total === 0 ? 0 : both / from.total;
                  return (
                    <td
                      key={to.tagId}
                      className="h-[30px] w-[34px] border border-ink/60 p-0"
                      style={{ background: self ? "rgba(231,227,216,0.03)" : fill(share) }}
                      onMouseEnter={(e) =>
                        !self &&
                        both > 0 &&
                        setHover({
                          from,
                          to,
                          both,
                          share,
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                    >
                      <span className="sr-only">
                        {self
                          ? `${from.name}, self`
                          : `${Math.round(share * 100)} percent of ${from.name} references also carry ${to.name} (${both} of ${from.total})`}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hover && (
        <div
          role="status"
          className="pointer-events-none fixed z-50 max-w-xs rounded border border-white/25 bg-ink-2 px-3.5 py-2.5 text-[13px] leading-snug shadow-[0_8px_26px_rgba(0,0,0,.6)]"
          style={{
            left: Math.min(hover.x + 14, 1100),
            top: Math.max(hover.y - 70, 12),
          }}
        >
          <span className="font-semibold text-bone">
            {Math.round(hover.share * 100)}% of {hover.from.name}
          </span>
          <span className="block text-bone/70">
            also carries {hover.to.name} — {hover.both} of {hover.from.total}
          </span>
          {hover.from.earlySignal && (
            <span className="mt-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-bone/70">
              <span aria-hidden className="inline-block h-2 w-2 flex-none bg-oxide" />
              Early Signal — too few references to trust
            </span>
          )}
        </div>
      )}

      {/* Legend. A sequential scale needs its ends named, not a swatch per step. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-bone/70">
        <span>Share of the row tag that also carries the column tag</span>
        <span className="flex items-center gap-1.5">
          <span>0%</span>
          {[0, 0.25, 0.5, 0.75, 1].map((s) => (
            <span
              key={s}
              aria-hidden
              className="inline-block h-3 w-6 border border-ink/60"
              style={{ background: fill(s) }}
            />
          ))}
          <span>100%</span>
        </span>
      </div>
    </div>
  );
}
