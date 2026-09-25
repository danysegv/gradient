"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AXES, AXIS_LABEL } from "@/lib/axes";
import { formatVelocity } from "@/lib/confidence-display";
import {
  RADAR_QUADRANT_LABEL,
  RADAR_QUADRANT_NOTE,
  formatRadarShare,
  type RadarQuadrant,
  type TrailedPoint as RadarPoint,
} from "@/lib/radar/trend-radar";

// The Trend Radar, drawn as SVG in the plate radar's hand: same grid, same
// Oxide-up / Slate-down pair, same 2px Ink ring, same corner words. What is
// added here is the reading: an axis filter that dims rather than removes
// (positions never move, so the library stays the frame), and one readout
// shared by the chart and the list, so hovering either names the other.

// The drawing is sized to its container rather than scaled into it, so
// type stays at its real size on a phone instead of shrinking to 6px.
const WIDE = { W: 640, H: 420 };
const M = { l: 52, r: 24, t: 26, b: 50 };
type Dims = { W: number; H: number };
function dimsFor(width: number): Dims {
  const W = Math.round(Math.min(WIDE.W, Math.max(320, width)));
  return { W, H: W >= 560 ? WIDE.H : Math.round(Math.max(340, W * 0.95)) };
}

const OXIDE = "#B4453A";
const SLATE = "#5C6B87";
const BONE = "#E7E3D8";
const INK = "#0B0A0E";

const QUADRANT_ORDER: RadarQuadrant[] = ["leading", "emerging", "established", "receding"];

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function scales(points: RadarPoint[], evenShare: number, { W, H }: Dims) {
  const PW = W - M.l - M.r;
  const PH = H - M.t - M.b;
  const maxShare = Math.max(evenShare, ...points.map((p) => p.share));
  // 5% steps, never tighter than 0–10%.
  const X = Math.max(0.1, Math.ceil(maxShare * 20 - 1e-9) / 20);
  const maxPts = Math.max(0, ...points.map((p) => Math.abs(p.shift * 100)));
  const step = maxPts <= 4 ? 1 : maxPts <= 8 ? 2 : 5;
  // Symmetric, a whole number of steps, never tighter than ±3 points.
  const Dpts = Math.max(3, Math.ceil((maxPts + 0.25) / step) * step);
  const x = (share: number) => M.l + (share / X) * PW;
  const y = (shift: number) => M.t + ((Dpts - shift * 100) / (2 * Dpts)) * PH;
  const yTicks: number[] = [];
  for (let v = -Dpts; v <= Dpts; v += step) yTicks.push(v / 100);
  const xTicks: number[] = [];
  const xStep = X <= 0.2 ? 0.05 : X <= 0.5 ? 0.1 : 0.25;
  for (let v = 0; v <= X + 1e-9; v += xStep) xTicks.push(Math.round(v * 100) / 100);
  return { X, x, y, xTicks, yTicks };
}

function placeLabels(
  dots: { p: RadarPoint; cx: number; cy: number; px?: number | null; py?: number | null }[],
  { W, H }: Dims
): { id: string; name: string; x: number; y: number; anchor: "start" | "end" }[] {
  const MAX_LABELS = W >= 560 ? 12 : 7;
  // Most telling first: the largest moves. Right of the dot, then left;
  // skip a label rather than let it collide. The list names every point.
  const priority = [...dots].sort((a, b) => Math.abs(b.p.shift) - Math.abs(a.p.shift));
  const placed: Box[] = [
    ...dots.map((d) => ({ x: d.cx - 7, y: d.cy - 7, w: 14, h: 14 })),
    // Last week's rings, so a name never sits on one.
    ...dots.flatMap((d) =>
      d.px == null || d.py == null ? [] : [{ x: d.px - 5, y: d.py - 5, w: 10, h: 10 }]
    ),
    { x: M.l, y: M.t + 4, w: 92, h: 16 },
    { x: W - M.r - 92, y: M.t + 4, w: 92, h: 16 },
    { x: M.l, y: H - M.b - 21, w: 92, h: 16 },
    { x: W - M.r - 104, y: H - M.b - 21, w: 104, h: 16 },
  ];
  const out: ReturnType<typeof placeLabels> = [];
  for (const d of priority) {
    if (out.length >= MAX_LABELS) break;
    const w = d.p.name.length * 6.2 + 2;
    const h = 13;
    const ly = Math.min(Math.max(d.cy - h / 2, M.t), H - M.b - h);
    const options = [
      { box: { x: d.cx + 10, y: ly, w, h }, x: d.cx + 10, anchor: "start" as const },
      { box: { x: d.cx - 10 - w, y: ly, w, h }, x: d.cx - 10, anchor: "end" as const },
    ];
    const fit = options.find(
      (o) =>
        o.box.x >= M.l &&
        o.box.x + o.box.w <= W - M.r &&
        !placed.some((q) => overlaps(q, o.box))
    );
    if (!fit) continue;
    placed.push(fit.box);
    out.push({ id: d.p.id, name: d.p.name, x: fit.x, y: ly + h - 3, anchor: fit.anchor });
  }
  return out;
}

const dotFill = (shift: number) => (shift > 0 ? OXIDE : shift < 0 ? SLATE : BONE);

export function TrendRadarChart({
  points,
  evenShare,
  hasTrail,
}: {
  points: RadarPoint[];
  evenShare: number;
  hasTrail: boolean;
}) {
  const [axis, setAxis] = useState<string | null>(null);
  const [trail, setTrail] = useState(true);
  const [hover, setHover] = useState<string | null>(null);

  const box = useRef<HTMLElement>(null);
  const [dims, setDims] = useState<Dims>(WIDE);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setDims(dimsFor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { W, H } = dims;

  const { X, x, y, xTicks, yTicks } = useMemo(
    () =>
      scales(
        [
          ...points,
          ...points.flatMap((p) => (p.prior ? [{ ...p, share: p.prior.share, shift: p.prior.shift }] : [])),
        ],
        evenShare,
        dims
      ),
    [points, evenShare, dims]
  );
  const dots = useMemo(
    () =>
      points.map((p) => ({
        p,
        cx: x(p.share),
        cy: y(p.shift),
        px: p.prior ? x(p.prior.share) : null,
        py: p.prior ? y(p.prior.shift) : null,
      })),
    [points, x, y]
  );
  const inFilter = (p: RadarPoint) => axis === null || p.group === axis;
  const labels = useMemo(
    () =>
      placeLabels(
        dots
          .filter((d) => axis === null || d.p.group === axis)
          .map((d) => (trail ? d : { ...d, px: null, py: null })),
        dims
      ),
    [dots, axis, dims, trail]
  );

  const axesPresent = AXES.filter((a) => points.some((p) => p.group === a.key));
  const focused = points.find((p) => p.id === hover) ?? null;
  const leading = points.filter((p) => p.quadrant === "leading").map((p) => p.name);

  return (
    <div>
      {/* axis filter: dims, never re-scales */}
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by axis">
        {[{ key: null as string | null, label: "All looks" }, ...axesPresent].map((a) => {
          const on = axis === a.key;
          return (
            <button
              key={a.key ?? "all"}
              type="button"
              aria-pressed={on}
              onClick={() => setAxis(a.key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                on
                  ? "border-bone bg-bone text-ink"
                  : "border-white/15 text-bone/70 hover:border-white/35 hover:text-bone"
              }`}
            >
              {a.label}
            </button>
          );
        })}
        {hasTrail && (
          <button
            type="button"
            aria-pressed={trail}
            onClick={() => setTrail((v) => !v)}
            className={`ml-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              trail
                ? "border-white/35 text-bone"
                : "border-white/15 text-bone/60 hover:border-white/35 hover:text-bone"
            }`}
          >
            <span aria-hidden className="inline-block h-2 w-2 rounded-full border border-bone/70" />
            A week ago
          </button>
        )}
      </div>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0">
          {/* the readout: one line, shared by the chart and the list */}
          <p
            className="mb-3 min-h-[20px] text-[12.5px] text-bone/70"
            aria-live="polite"
          >
            {focused ? (
              <>
                <span className="font-semibold text-bone">{focused.name}</span>
                <span className="text-bone/55"> · {AXIS_LABEL[focused.group] ?? focused.group}</span>
                {" — "}
                <span className="tabular-nums text-bone">{formatRadarShare(focused.share)}</span> of the
                library,{" "}
                <span className={`tabular-nums ${focused.shift > 0 ? "text-oxide" : "text-bone"}`}>
                  {formatVelocity(focused.shift)}
                </span>{" "}
                in 30 days, <span className="tabular-nums">{focused.refs}</span> references
                <span className="text-bone/55">
                  {focused.prior
                    ? focused.prior.quadrant === focused.quadrant
                      ? ` · ${RADAR_QUADRANT_LABEL[focused.quadrant]} a week ago too`
                      : ` · ${RADAR_QUADRANT_LABEL[focused.prior.quadrant]} a week ago`
                    : hasTrail
                      ? " · new this week"
                      : ""}
                </span>
              </>
            ) : (
              <span className="text-bone/50">Hover or tab to a look to read it.</span>
            )}
          </p>

          <figure ref={box} className="m-0">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="block h-auto w-full max-w-full"
              role="img"
              aria-label={`Trend radar. ${points.length} published looks, placed by share of the library against the change in that share over 30 days.${
                leading.length ? ` Leading: ${leading.join(", ")}.` : ""
              } The list beside it has every value.`}
            >
              {yTicks.map((v) => (
                <g key={`y${v}`}>
                  <line
                    x1={M.l}
                    x2={W - M.r}
                    y1={y(v)}
                    y2={y(v)}
                    stroke={BONE}
                    strokeOpacity={Math.abs(v) < 1e-9 ? 0.35 : 0.06}
                  />
                  <text
                    x={M.l - 8}
                    y={y(v) + 3.5}
                    textAnchor="end"
                    className="fill-bone/60 text-[10.5px] tabular-nums"
                  >
                    {formatVelocity(v)}
                  </text>
                </g>
              ))}
              {xTicks.map((v) => (
                <g key={`x${v}`}>
                  <line x1={x(v)} x2={x(v)} y1={M.t} y2={H - M.b} stroke={BONE} strokeOpacity={0.06} />
                  <text
                    x={x(v)}
                    y={H - M.b + 16}
                    textAnchor={v === 0 ? "start" : Math.abs(v - X) < 1e-9 ? "end" : "middle"}
                    className="fill-bone/60 text-[10.5px] tabular-nums"
                  >
                    {Math.round(v * 100)}%
                  </text>
                </g>
              ))}

              {/* the even split: right of it, more than a fair share */}
              <line
                x1={x(evenShare)}
                x2={x(evenShare)}
                y1={M.t}
                y2={H - M.b}
                stroke={BONE}
                strokeOpacity={0.28}
                strokeDasharray="3 4"
              />
              <text
                x={x(evenShare) + 5}
                y={H - M.b - 30}
                className="fill-bone/45 text-[9.5px] font-semibold uppercase tracking-wide"
              >
                Even split
              </text>

              <text
                x={W - M.r}
                y={H - 8}
                textAnchor="end"
                className="fill-bone/70 text-[10px] font-semibold uppercase tracking-wide"
              >
                Share of the library →
              </text>
              <text x={M.l} y={M.t - 10} className="fill-bone/70 text-[10px] font-semibold uppercase tracking-wide">
                Change in share, 30 days
              </text>

              {(
                [
                  ["emerging", M.l + 8, M.t + 16, "start"],
                  ["leading", W - M.r - 8, M.t + 16, "end"],
                  ["receding", M.l + 8, H - M.b - 9, "start"],
                  ["established", W - M.r - 8, H - M.b - 9, "end"],
                ] as const
              ).map(([q, qx, qy, anchor]) => (
                <text
                  key={q}
                  x={qx}
                  y={qy}
                  textAnchor={anchor}
                  className="fill-bone/45 text-[10px] font-semibold uppercase tracking-[0.12em]"
                >
                  {RADAR_QUADRANT_LABEL[q]}
                </text>
              ))}

              {trail &&
                dots.map(({ p, cx, cy, px, py }) =>
                  px === null || py === null ? null : (
                    <g
                      key={`trail-${p.id}`}
                      aria-hidden
                      className="pointer-events-none"
                      opacity={inFilter(p) ? (hover === null || hover === p.id ? 1 : 0.35) : 0.12}
                      style={{ transition: "opacity 160ms ease" }}
                    >
                      <line x1={px} y1={py} x2={cx} y2={cy} stroke={BONE} strokeOpacity={0.3} strokeWidth={1} />
                      <circle cx={px} cy={py} r={3} fill={INK} stroke={BONE} strokeOpacity={0.55} strokeWidth={1} />
                    </g>
                  )
                )}

              {[...dots]
                .sort((a, b) => Number(a.p.id === hover) - Number(b.p.id === hover))
                .map(({ p, cx, cy }) => {
                  const on = p.id === hover;
                  const lit = inFilter(p);
                  return (
                    <Link
                      key={p.id}
                      href={`/trend/${encodeURIComponent(p.name)}`}
                      aria-label={`${p.name}: ${formatRadarShare(p.share)} of the library, ${formatVelocity(p.shift)} in 30 days`}
                      onMouseEnter={() => setHover(p.id)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(p.id)}
                      onBlur={() => setHover(null)}
                      className="outline-none"
                    >
                      <circle cx={cx} cy={cy} r={13} fill="transparent" />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={on ? 7 : 5.5}
                        fill={dotFill(p.shift)}
                        fillOpacity={lit ? 1 : 0.18}
                        stroke={on ? BONE : INK}
                        strokeWidth={2}
                        style={{ transition: "r 120ms ease, fill-opacity 160ms ease" }}
                      />
                    </Link>
                  );
                })}

              {labels.map((l) => (
                <text
                  key={`label-${l.id}`}
                  x={l.x}
                  y={l.y}
                  textAnchor={l.anchor}
                  className={`pointer-events-none text-[11px] font-medium ${
                    l.id === hover ? "fill-bone" : "fill-bone/80"
                  }`}
                >
                  {l.name}
                </text>
              ))}
            </svg>
          </figure>
          <p className="mt-3 max-w-xl text-[11.5px] leading-relaxed text-bone/65">
            Across: each look&rsquo;s share of every published reference. The dashed line is the
            even split, one share per look; right of it, a look holds more than its fair part of
            the library. Up and down: how that share moved in the last 30 days, in points.
            Oxide is taking share, Slate is giving it back.
            {hasTrail && " The small ring is where each look sat a week ago, read the same way."}
          </p>
        </div>

        <div className="min-w-0">
          {QUADRANT_ORDER.map((q) => {
            const rows = points.filter((p) => p.quadrant === q);
            if (rows.length === 0) return null;
            return (
              <section key={q} className="mb-6">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-bone/75">
                  {RADAR_QUADRANT_LABEL[q]}
                </p>
                <p className="mb-1 text-[11.5px] text-bone/50">{RADAR_QUADRANT_NOTE[q]}</p>
                <ul className="divide-y divide-white/[.07]">
                  {rows.map((p) => (
                    <li
                      key={p.id}
                      onMouseEnter={() => setHover(p.id)}
                      onMouseLeave={() => setHover(null)}
                      className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 py-2 transition-opacity ${
                        inFilter(p) ? "" : "opacity-30"
                      }`}
                    >
                      <div className="min-w-0 truncate">
                        <Link
                          href={`/trend/${encodeURIComponent(p.name)}`}
                          className={`text-[11px] font-semibold uppercase tracking-wide hover:opacity-80 ${
                            p.id === hover ? "text-bone underline underline-offset-4" : "text-bone"
                          }`}
                        >
                          {p.name}
                        </Link>
                        <span className="ml-2 text-[10.5px] text-bone/55">
                          {AXIS_LABEL[p.group] ?? p.group}
                        </span>
                        {hasTrail && (!p.prior || p.prior.quadrant !== p.quadrant) && (
                          <span className="ml-2 text-[10.5px] text-bone/45">
                            {p.prior ? `was ${RADAR_QUADRANT_LABEL[p.prior.quadrant]}` : "new"}
                          </span>
                        )}
                      </div>
                      <span className="text-right text-[12.5px] tabular-nums text-bone/80">
                        {formatRadarShare(p.share)}
                      </span>
                      <span className="flex w-[52px] items-center justify-end gap-1.5 text-[12.5px] tabular-nums text-bone">
                        <span
                          aria-hidden
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            p.shift > 0 ? "bg-oxide" : p.shift < 0 ? "bg-slate" : "bg-bone/50"
                          }`}
                        />
                        {formatVelocity(p.shift)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
