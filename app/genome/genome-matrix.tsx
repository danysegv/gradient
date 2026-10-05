"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AXES, AXIS_LABEL } from "@/lib/axes";
import { matrixOrder, oneWayCells, type GenomeLook, type GenomePair } from "@/lib/genome";

// The genome matrix, kept — it is the page's personality — and organised
// (Daniela, 2026-10-01):
//
//   * Grouped by axis. Rows and columns run axis by axis, densest first
//     inside each, with a gap between axes, so the grid reads as blocks
//     instead of one long alphabet.
//   * Sized to its container. The cell is (width − label column) ÷ looks,
//     so it fills a laptop and still fits a phone without a sideways scroll.
//     Below a legible size the column names give way to axis codes and the
//     readout carries the names.
//   * Focus by axis. With a big vocabulary, pick an axis and only its rows
//     show, against every column — the grid stays short at any size.
//   * One readout, above the grid, instead of a floating tooltip: tap or
//     hover a cell, its row and column light up, the sentence says what it
//     means. Works the same with a finger.
//   * An Oxide notch marks a one-way pull — a cell at 50%+ whose mirror is
//     at least 25 points lower. That asymmetry is the genome's finding, so
//     it gets the accent colour.
//   * The whole vocabulary, incubating looks too. They sit at the tail of
//     their axis and everything touching them is drawn in Slate, so the
//     published genome reads first and the new vocabulary reads as new.
//   * When the vocabulary outgrows the screen the cell stops shrinking at a
//     tappable size and the grid scrolls sideways under pinned names,
//     rather than turning into dust.

const SHORT: Record<string, string> = {
  movement: "MOV",
  typography: "TYP",
  palette_light: "PAL",
  layout: "LAY",
  treatment: "TRT",
  medium: "MED",
  subject: "SUB",
  format_motion: "FMT",
};

// Sequential: Bone on Ink, one hue, light = more. Floor high enough that a
// real relationship never reads as an empty cell.
// Incubating: the same ramp in Slate (#5C6B87), quieter by design.
const fill = (share: number, incubating = false) =>
  share <= 0
    ? "rgba(231,227,216,0.025)"
    : incubating
      ? `rgba(92,107,135,${(0.14 + share * 0.86).toFixed(3)})`
      : `rgba(231,227,216,${(0.08 + share * 0.82).toFixed(3)})`;

const GAP = 4; // between axes
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function GenomeMatrix({ looks, pairs }: { looks: GenomeLook[]; pairs: GenomePair[] }) {
  const [axis, setAxis] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ r: string; c: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byId = useMemo(() => new Map(looks.map((l) => [l.id, l])), [looks]);
  const both = useMemo(() => new Map(pairs.map((p) => [`${p.from}|${p.to}`, p.both])), [pairs]);
  const share = (r: GenomeLook, c: GenomeLook) =>
    r.id === c.id || r.total === 0 ? 0 : (both.get(`${r.id}|${c.id}`) ?? 0) / r.total;
  const notches = useMemo(() => oneWayCells(byId, pairs), [byId, pairs]);

  const cols = useMemo(() => matrixOrder(looks), [looks]);
  const rows = axis ? cols.filter((l) => l.group === axis) : cols;
  const groups = [...new Set(cols.map((l) => l.group))];
  const axesPresent = AXES.filter((a) => groups.includes(a.key));

  // Geometry from the container, not a fixed cell.
  const narrow = width < 640;
  const labelW = narrow ? 92 : 176;
  const gaps = (groups.length - 1) * GAP;
  const fit = Math.floor((width - labelW - gaps) / Math.max(1, cols.length));
  // Never smaller than a fingertip can aim at; past that, scroll.
  const cell = Math.max(narrow ? 14 : 12, Math.min(34, fit));
  const scrolls = labelW + cols.length * cell + gaps > width + 1;
  const steep = cell < 20; // names stand upright when columns are tight
  const nameFont = cell < 16 ? 9.5 : 10.5;
  const longest = Math.max(0, ...cols.map((c) => c.name.length));
  const headerH = Math.min(150, Math.ceil(longest * nameFont * (steep ? 0.58 : 0.5))) + 10;
  const xOf = new Map<string, number>();
  {
    let x = 0;
    let last = "";
    for (const c of cols) {
      if (last && c.group !== last) x += GAP;
      xOf.set(c.id, x);
      x += cell;
      last = c.group;
    }
  }
  const gridW = cols.length * cell + gaps;

  const fr = focus ? byId.get(focus.r) : null;
  const fc = focus ? byId.get(focus.c) : null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Rows by axis">
        {[{ key: null as string | null, label: "All looks" }, ...axesPresent].map((a) => {
          const on = axis === a.key;
          return (
            <button
              key={a.key ?? "all"}
              type="button"
              aria-pressed={on}
              onClick={() => setAxis(a.key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                on ? "border-bone bg-bone text-ink" : "border-white/15 text-bone/70 hover:border-white/35 hover:text-bone"
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {/* The readout. Always one line tall, so the grid never jumps. */}
      <p className="mb-3 min-h-[40px] text-[13px] leading-snug text-bone/70 sm:min-h-[22px]" aria-live="polite">
        {fr && fc ? (
          <>
            <span className="tabular-nums text-bone">{pct(share(fr, fc))}</span> of{" "}
            <Link href={`/trend/${encodeURIComponent(fr.name)}`} className="font-semibold text-bone hover:underline">
              {fr.name}
            </Link>{" "}
            also carries{" "}
            <Link href={`/trend/${encodeURIComponent(fc.name)}`} className="font-semibold text-bone hover:underline">
              {fc.name}
            </Link>
            <span className="text-bone/50">
              {" "}
              · {pct(share(fc, fr))} the other way · {both.get(`${fr.id}|${fc.id}`) ?? 0} of {fr.total}
              {fr.early ? " · Early Signal" : ""}
            </span>
            {(fr.incubating || fc.incubating) && <span className="text-slate"> · Incubating</span>}
          </>
        ) : (
          <span className="text-bone/45">
            Read across a row. {narrow ? "Tap a square" : "Hover or tap a square"}
            {scrolls ? " · swipe for more." : "."}
          </span>
        )}
      </p>

      <div ref={box} className={`w-full ${scrolls ? "overflow-x-auto overscroll-x-contain pb-2" : ""}`}>
        <div className="relative" style={{ width: labelW + gridW }} onMouseLeave={() => setFocus(null)}>
          {/* Column header: names when they fit, axis codes always. */}
          <div className="relative" style={{ height: headerH + 16, marginLeft: labelW }}>
            {groups.map((g) => {
              const inG = cols.filter((c) => c.group === g);
              const x0 = xOf.get(inG[0].id)!;
              return (
                <span
                  key={g}
                  title={AXIS_LABEL[g] ?? g}
                  className="absolute top-0 truncate border-t border-bone/30 pt-1 text-[9.5px] font-semibold tracking-[0.12em] text-bone/55"
                  style={{ left: x0, width: inG.length * cell }}
                >
                  {SHORT[g] ?? g}
                </span>
              );
            })}
            {cols.map((c) => (
              <span
                key={c.id}
                className={`absolute bottom-1 origin-bottom-left whitespace-nowrap leading-none transition-colors ${
                  focus?.c === c.id
                    ? "text-bone"
                    : c.incubating
                      ? c.early ? "text-slate/70" : "text-slate"
                      : c.early ? "text-bone/35" : "text-bone/60"
                }`}
                style={{
                  fontSize: nameFont,
                  left: xOf.get(c.id)! + cell / 2 + (steep ? nameFont / 2 : 4),
                  transform: steep ? "rotate(-90deg)" : "rotate(-60deg)",
                }}
              >
                {c.name}
              </span>
            ))}
          </div>

          {rows.map((r, ri) => {
            const newGroup = ri > 0 && rows[ri - 1].group !== r.group;
            return (
              <div key={r.id} className="flex items-center" style={{ height: cell, marginTop: newGroup ? GAP : 0 }}>
                <span
                  className={`sticky left-0 z-10 flex h-full shrink-0 items-center gap-1.5 overflow-hidden bg-ink pr-2 ${
                    focus?.r === r.id
                      ? "text-bone"
                      : r.incubating
                        ? r.early ? "text-slate/70" : "text-slate"
                        : r.early ? "text-bone/35" : "text-bone/80"
                  }`}
                  style={{ width: labelW }}
                  title={`${AXIS_LABEL[r.group] ?? r.group} · ${r.total} references${r.incubating ? " · Incubating" : ""}`}
                >
                  <span className={`truncate ${narrow ? "text-[10.5px]" : "text-[12px] font-semibold"}`}>{r.name}</span>
                  {!narrow && <span className="text-[10px] tabular-nums text-bone/35">{r.total}</span>}
                </span>
                <div className="relative" style={{ width: gridW, height: cell }}>
                  {cols.map((c) => {
                    const self = r.id === c.id;
                    const s = share(r, c);
                    const lit = focus && (focus.r === r.id || focus.c === c.id);
                    const on = focus?.r === r.id && focus?.c === c.id;
                    const notch = notches.has(`${r.id}|${c.id}`);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={self}
                        onMouseEnter={() => !self && setFocus({ r: r.id, c: c.id })}
                        onFocus={() => !self && setFocus({ r: r.id, c: c.id })}
                        onClick={() => !self && setFocus({ r: r.id, c: c.id })}
                        aria-label={self ? `${r.name}` : `${pct(s)} of ${r.name} also carries ${c.name}`}
                        className="absolute top-0 p-0 outline-none"
                        style={{ left: xOf.get(c.id)!, width: cell, height: cell }}
                      >
                        <span
                          className="absolute inset-[1px] block transition-opacity"
                          style={{
                            background: self ? "transparent" : fill(s, !!(r.incubating || c.incubating)),
                            opacity: focus && !lit ? 0.45 : 1,
                            outline: on ? "1.5px solid #E7E3D8" : undefined,
                            outlineOffset: on ? "1px" : undefined,
                            borderRadius: 1,
                          }}
                        />
                        {self && (
                          <span aria-hidden className="absolute inset-[30%] block rotate-45 border border-bone/15" />
                        )}
                        {notch && (
                          <span
                            aria-hidden
                            className="absolute right-[1px] top-[1px] block bg-oxide"
                            style={{ width: Math.max(3, cell * 0.28), height: Math.max(3, cell * 0.28) }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key: marks, not sentences. */}
      <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-bone/60">
        <li className="flex items-center gap-1.5">
          <span>0%</span>
          {[0.05, 0.25, 0.5, 0.75, 1].map((s) => (
            <span key={s} aria-hidden className="inline-block h-3 w-5" style={{ background: fill(s) }} />
          ))}
          <span>100%</span>
        </li>
        <li className="flex items-center gap-1.5" title="At least half of the row look carries the column look, and at least 25 points less the other way.">
          <span aria-hidden className="inline-block h-2 w-2 bg-oxide" />
          One-way pull
        </li>
        <li className="flex items-center gap-1.5" title="New vocabulary: applied to clips, not yet in the published figures.">
          {[0.25, 0.6, 1].map((s) => (
            <span key={s} aria-hidden className="inline-block h-3 w-3" style={{ background: fill(s, true) }} />
          ))}
          Incubating
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2 w-2 rounded-[1px] bg-bone/30" />
          Dimmed name: Early Signal
        </li>
      </ul>
    </div>
  );
}
