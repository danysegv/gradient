import Link from "next/link";
import { AXIS_LABEL } from "@/lib/axes";
import {
  BOARD_RADAR_MIN_CLIPS,
  CORE_SHARE,
  QUADRANT_LABEL,
  formatLean,
  formatShare,
  type BoardRadar as Radar,
  type RadarTag,
} from "@/lib/boards/radar";

// The board radar, drawn server-side as SVG. One scale places the dots,
// ticks and labels. Horizontal: how much of the board carries a look.
// Vertical: how far the board leans toward or away from the library, in
// points. Oxide above the line, Slate below — the same diverging pair the
// Signature block uses — and position carries the polarity too, since
// Slate on Ink reads close to gray.

const W = 560;
const H = 380;
const M = { l: 48, r: 20, t: 22, b: 46 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;
const MAX_LABELS = 10;
const LIST_OPEN = 12;

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function layout(tags: RadarTag[]) {
  const plotted = tags.filter((t) => t.lean !== null);
  const maxAbs = plotted.reduce((m, t) => Math.max(m, Math.abs(t.lean!)), 0);
  // Symmetric around zero, in steps of 10 points, never tighter than ±20.
  const D = Math.max(0.2, Math.ceil(maxAbs * 10 + 1e-9) / 10);
  // Published looks often sit under half the board, since incubating tags
  // carry much of it; stretching 0–100% would crowd them into a corner.
  // Zoom to 0–50% when everything fits, and say so on the axis.
  const maxShare = plotted.reduce((m, t) => Math.max(m, t.boardShare), 0);
  const X = maxShare <= 0.5 ? 0.5 : 1;
  const x = (share: number) => M.l + (share / X) * PW;
  const y = (lean: number) => M.t + ((D - lean) / (2 * D)) * PH;

  const dots = plotted.map((t) => ({ t, cx: x(t.boardShare), cy: y(t.lean!) }));

  // Labels: the most telling points first. Try right of the dot, then left;
  // skip a label rather than let it collide. Every point keeps its tooltip
  // and its row in the list, so a skipped label hides nothing.
  const priority = [...dots].sort(
    (a, b) =>
      Number(b.t.quadrant === "signature") - Number(a.t.quadrant === "signature") ||
      Math.abs(b.t.lean!) - Math.abs(a.t.lean!)
  );
  const placed: Box[] = [
    ...dots.map((d) => ({ x: d.cx - 6, y: d.cy - 6, w: 12, h: 12 })),
    // The four quadrant names, so a tag label never sits on one.
    { x: M.l, y: M.t + 4, w: 84, h: 16 },
    { x: W - M.r - 90, y: M.t + 4, w: 90, h: 16 },
    { x: M.l, y: H - M.b - 21, w: 96, h: 16 },
    { x: W - M.r - 96, y: H - M.b - 21, w: 96, h: 16 },
  ];
  const labels: { name: string; x: number; y: number; anchor: "start" | "end" }[] = [];
  for (const d of priority) {
    if (labels.length >= MAX_LABELS) break;
    const w = d.t.name.length * 6.1 + 2;
    const h = 13;
    // Kept inside the plot vertically, so a point on the edge (often the
    // most telling one) can still be named.
    const ly = Math.min(Math.max(d.cy - h / 2, M.t), H - M.b - h);
    const options = [
      { box: { x: d.cx + 9, y: ly, w, h }, x: d.cx + 9, anchor: "start" as const },
      { box: { x: d.cx - 9 - w, y: ly, w, h }, x: d.cx - 9, anchor: "end" as const },
    ];
    const fit = options.find(
      (o) =>
        o.box.x >= M.l &&
        o.box.x + o.box.w <= W - M.r &&
        o.box.y >= M.t &&
        o.box.y + o.box.h <= H - M.b &&
        !placed.some((p) => overlaps(p, o.box))
    );
    if (!fit) continue;
    placed.push(fit.box);
    labels.push({ name: d.t.name, x: fit.x, y: ly + h - 3, anchor: fit.anchor });
  }

  const yTicks = [-D, -D / 2, 0, D / 2, D];
  const xTicks = X === 0.5 ? [0, 0.1, 0.2, 0.3, 0.4, 0.5] : [0, 0.25, 0.5, 0.75, 1];
  return { D, X, x, y, dots, labels, yTicks, xTicks };
}

function Chart({ radar }: { radar: Radar }) {
  const { X, x, y, dots, labels, yTicks, xTicks } = layout(radar.tags);
  const signature = radar.tags.filter((t) => t.quadrant === "signature").map((t) => t.name);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full max-w-full"
        role="img"
        aria-label={`Board radar. ${dots.length} published looks plotted by share of this board against lean versus the library.${
          signature.length ? ` Signature: ${signature.join(", ")}.` : ""
        } The list beside it has every value.`}
      >
        {/* grid */}
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line
              x1={M.l}
              x2={W - M.r}
              y1={y(v)}
              y2={y(v)}
              stroke="#E7E3D8"
              strokeOpacity={v === 0 ? 0.35 : 0.06}
              strokeWidth={1}
            />
            <text
              x={M.l - 8}
              y={y(v) + 3.5}
              textAnchor="end"
              className="fill-bone/60 text-[10.5px] tabular-nums"
            >
              {formatLean(v)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <g key={`x${v}`}>
            <line
              x1={x(v)}
              x2={x(v)}
              y1={M.t}
              y2={H - M.b}
              stroke="#E7E3D8"
              strokeOpacity={0.06}
              strokeWidth={1}
            />
            <text
              x={x(v)}
              y={H - M.b + 16}
              textAnchor={v === 0 ? "start" : v === X ? "end" : "middle"}
              className="fill-bone/60 text-[10.5px] tabular-nums"
            >
              {formatShare(v)}
            </text>
          </g>
        ))}

        {/* the core line: on this much of the board, a look is core */}
        <line
          x1={x(CORE_SHARE)}
          x2={x(CORE_SHARE)}
          y1={M.t}
          y2={H - M.b}
          stroke="#E7E3D8"
          strokeOpacity={0.28}
          strokeDasharray="3 4"
          strokeWidth={1}
        />

        {/* axis titles */}
        <text
          x={W - M.r}
          y={H - 6}
          textAnchor="end"
          className="fill-bone/70 text-[10px] font-semibold uppercase tracking-wide"
        >
          {X === 0.5 ? "Share of this board, 0–50% →" : "Share of this board →"}
        </text>
        <text
          x={M.l}
          y={M.t - 9}
          className="fill-bone/70 text-[10px] font-semibold uppercase tracking-wide"
        >
          Points vs library
        </text>

        {/* quadrant names, one per corner */}
        {(
          [
            ["accent", M.l + 8, M.t + 16, "start"],
            ["signature", W - M.r - 8, M.t + 16, "end"],
            ["background", M.l + 8, H - M.b - 9, "start"],
            ["foundation", W - M.r - 8, H - M.b - 9, "end"],
          ] as const
        ).map(([q, qx, qy, anchor]) => (
          <text
            key={q}
            x={qx}
            y={qy}
            textAnchor={anchor}
            className="fill-bone/45 text-[10px] font-semibold uppercase tracking-[0.12em]"
          >
            {QUADRANT_LABEL[q]}
          </text>
        ))}

        {/* points: Oxide leans toward, Slate leans away, 2px Ink ring */}
        {[...dots]
          .sort((a, b) => Math.abs(a.t.lean!) - Math.abs(b.t.lean!))
          .map(({ t, cx, cy }) => (
            <g key={t.name} className="group">
              <title>
                {`${t.name} — on ${formatShare(t.boardShare)} of this board (${t.count} clips), ${formatShare(
                  t.libraryShare ?? 0
                )} of the library, ${formatLean(t.lean!)} points`}
              </title>
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={5}
                fill={t.lean! > 0 ? "#B4453A" : t.lean! < 0 ? "#5C6B87" : "#E7E3D8"}
                fillOpacity={t.lean === 0 ? 0.6 : 1}
                stroke="#0B0A0E"
                strokeWidth={2}
                className="group-hover:stroke-bone"
              />
            </g>
          ))}

        {labels.map((l) => (
          <text
            key={`label-${l.name}`}
            x={l.x}
            y={l.y}
            textAnchor={l.anchor}
            className="pointer-events-none fill-bone/85 text-[11px] font-medium"
          >
            {l.name}
          </text>
        ))}
      </svg>
    </figure>
  );
}

function Row({ t }: { t: RadarTag }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 py-2.5">
      <div className="min-w-0">
        <Link
          href={`/trend/${encodeURIComponent(t.name)}`}
          className="text-[11px] font-semibold uppercase tracking-wide text-bone hover:opacity-80"
        >
          {t.name}
        </Link>
        <span className="ml-2 text-[10.5px] text-bone/55">
          {AXIS_LABEL[t.group] ?? t.group}
        </span>
      </div>
      <span className="text-right text-[13px] font-normal tabular-nums text-bone">
        {formatShare(t.boardShare)}
      </span>
      <div className="relative h-[5px] bg-white/[.06]" aria-hidden>
        <span
          className="absolute inset-y-0 left-0 bg-bone/70"
          style={{ width: `${Math.round(t.boardShare * 100)}%` }}
        />
      </div>
      <span className="flex items-center justify-end gap-1.5 text-right text-[11.5px] text-bone/70">
        {t.lean === null ? (
          t.isPublished ? (
            <span className="tabular-nums">{t.count} clips</span>
          ) : (
            <span>Incubating</span>
          )
        ) : (
          <>
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                t.lean > 0 ? "bg-oxide" : t.lean < 0 ? "bg-slate" : "bg-bone/50"
              }`}
            />
            <span className="font-normal tabular-nums">{formatLean(t.lean)}</span>
            <span>vs library</span>
          </>
        )}
      </span>
    </li>
  );
}

export function BoardRadar({ radar }: { radar: Radar }) {
  const head = radar.tags.slice(0, LIST_OPEN);
  const rest = radar.tags.slice(LIST_OPEN);

  return (
    <section className="mb-12 border-t border-white/10 pt-7">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
            Board radar
          </p>
          <p className="max-w-xl text-[13px] leading-relaxed text-bone/70">
            What this board is made of, against the whole library. It describes
            this collection, not a trend: the Signals radar is a separate reading,
            and nothing here feeds it.
          </p>
        </div>
        <p className="text-[12px] text-bone/65">
          <span className="font-normal tabular-nums">{radar.classifiedClips}</span>{" "}
          tagged {radar.classifiedClips === 1 ? "clip" : "clips"}
        </p>
      </div>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0">
          {radar.readable ? (
            <>
              <Chart radar={radar} />
              <p className="mt-3 max-w-xl text-[11.5px] leading-relaxed text-bone/65">
                A look is <span className="text-bone/85">core</span> once it is on{" "}
                {formatShare(CORE_SHARE)} of the board. Above the line the board has
                more of it than the library does; below, less. Incubating looks
                show their share of the board only.
              </p>
            </>
          ) : (
            <div className="flex aspect-[56/38] w-full max-w-full flex-col items-center justify-center gap-2 border border-white/10 bg-ink-2 px-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-bone/75">
                Not yet readable
              </p>
              <p className="max-w-sm text-[13px] leading-relaxed text-bone/70">
                The radar plots once {BOARD_RADAR_MIN_CLIPS} clips on this board carry
                tags.{" "}
                <span className="font-normal tabular-nums">{radar.clipsToReadable}</span>{" "}
                more to go. Below that, one clip moves a share by more than 8 points.
              </p>
            </div>
          )}
          {radar.absent.length > 0 && (
            <p className="mt-5 text-[12.5px] leading-relaxed text-bone/70">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-bone/60">
                Missing here
              </span>{" "}
              {radar.absent.map((a, i) => (
                <span key={a.name}>
                  {i > 0 && " · "}
                  <span className="text-bone/90">{a.name}</span>, on{" "}
                  <span className="font-normal tabular-nums">{formatShare(a.libraryShare)}</span> of
                  the library
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-bone/60">
            Share of this board
          </p>
          <ul className="divide-y divide-white/[.07]">
            {head.map((t) => (
              <Row key={t.name} t={t} />
            ))}
          </ul>
          {rest.length > 0 && (
            <details className="group mt-1">
              <summary className="cursor-pointer list-none py-2 text-[11px] font-semibold uppercase tracking-wide text-bone/70 hover:text-bone">
                <span className="group-open:hidden">All {radar.tags.length} looks</span>
                <span className="hidden group-open:inline">Fewer</span>
              </summary>
              <ul className="divide-y divide-white/[.07]">
                {rest.map((t) => (
                  <Row key={t.name} t={t} />
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
