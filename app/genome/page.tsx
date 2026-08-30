import Link from "next/link";
import { supabasePublic } from "@/lib/supabase/public";
import { EARLY_SIGNAL_MAX } from "@/lib/confidence";
import { Wordmark } from "@/components/wordmark";
import { GenomeMatrix, type GenomeTag, type GenomeCell } from "./genome-matrix";

export const revalidate = 0;

export const metadata = {
  title: "Visual Genome — 04AM",
  description:
    "Which visual traits travel together, and in which direction.",
};

// PostgREST serialises bigint as a JSON string. Coerced at the boundary,
// once, before anything arithmetic happens.
type RawRow = {
  from_tag_id: string;
  from_name: string;
  from_group: string;
  from_total: number | string;
  to_tag_id: string;
  to_name: string;
  both_count: number | string;
};

// Mirrors the short codes the matrix prints beside each row label.
const AXIS_SHORT: Record<string, string> = {
  movement: "MOV",
  typography: "TYP",
  palette_light: "PAL",
  layout: "LAY",
  format_motion: "FMT",
  treatment: "TRT",
};

const AXIS_LABEL: Record<string, string> = {
  movement: "Movement",
  typography: "Typography",
  palette_light: "Palette & Light",
  layout: "Layout",
  format_motion: "Format & Motion",
  treatment: "Treatment",
};

export default async function GenomePage() {
  const { data } = await supabasePublic.rpc("tag_cooccurrence");
  const rows = ((data ?? []) as unknown as RawRow[]).map((r) => ({
    fromId: r.from_tag_id,
    fromName: r.from_name,
    fromGroup: r.from_group,
    fromTotal: Number(r.from_total),
    toId: r.to_tag_id,
    toName: r.to_name,
    both: Number(r.both_count),
  }));

  // Tags come out of the pair list rather than a second query — a tag with
  // no co-occurrence at all has no row here and nothing to show anyway.
  const tagMap = new Map<string, GenomeTag>();
  for (const r of rows) {
    if (!tagMap.has(r.fromId)) {
      tagMap.set(r.fromId, {
        tagId: r.fromId,
        name: r.fromName,
        group: r.fromGroup,
        total: r.fromTotal,
        // Same band the feed uses. A tag this thin can still be drawn, but
        // its percentages are arithmetic, not evidence — 1 of 1 is 100%.
        earlySignal: r.fromTotal <= EARLY_SIGNAL_MAX,
      });
    }
  }
  // Densest first, so the tags that actually share references form a block
  // in the top-left instead of scattering down an alphabetical list.
  const tags = [...tagMap.values()].sort((a, b) => b.total - a.total);
  const cells: GenomeCell[] = rows.map((r) => ({
    from: r.fromId,
    to: r.toId,
    both: r.both,
  }));

  const shareOf = new Map(rows.map((r) => [`${r.fromId}|${r.toId}`, r]));
  const trusted = new Set(
    tags.filter((t) => !t.earlySignal).map((t) => t.tagId)
  );

  // The asymmetry is the finding. P(B|A) high while P(A|B) is low means A
  // needs B and B does not need A — a one-way dependency, which a symmetric
  // network graph would have averaged away into a single edge.
  const directions = rows
    .filter(
      (r) =>
        trusted.has(r.fromId) &&
        trusted.has(r.toId) &&
        r.both / r.fromTotal >= 0.5
    )
    .map((r) => {
      const back = shareOf.get(`${r.toId}|${r.fromId}`);
      const backTotal = tagMap.get(r.toId)?.total ?? 0;
      const backShare = back && backTotal ? back.both / backTotal : 0;
      return {
        key: `${r.fromId}|${r.toId}`,
        from: r.fromName,
        to: r.toName,
        share: r.both / r.fromTotal,
        both: r.both,
        fromTotal: r.fromTotal,
        backShare,
        gap: r.both / r.fromTotal - backShare,
      };
    })
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5);

  // A tag that other movements lean on repeatedly, while leaning back much
  // less, is behaving like a substrate rather than a peer. Derived from the
  // list above rather than asserted, so it cannot go stale.
  const receiverCounts = new Map<string, number>();
  for (const d of directions) {
    receiverCounts.set(d.to, (receiverCounts.get(d.to) ?? 0) + 1);
  }
  const substrates = [...receiverCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const shownTags = tags.length;
  const trustedTags = trusted.size;
  const pairCount = rows.filter((r) => r.both > 0).length;
  const groups = [...new Set(tags.map((t) => t.group))];

  return (
    <>
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-7">
        <Link href="/" aria-label="04AM — Signals Feed">
          <Wordmark className="h-[22px] text-bone" />
        </Link>
        <nav className="flex items-center gap-7">
          <Link
            href="/"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Signals
          </Link>
          {/* Radar stays inert until velocity has a run of days to plot. */}
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone/55">
            Radar
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone">
            Genome
          </span>
          <a
            href="/clip"
            className="rounded bg-oxide px-4 py-2 text-[13px] font-semibold tracking-wide text-bone"
          >
            + Clip
          </a>
        </nav>
      </header>

      <div className="mx-auto max-w-[1180px] px-8">
        <div className="pt-11 pb-2">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
            Visual Genome — what travels with what
          </p>
          <h1 className="mb-2.5 text-[34px] font-bold leading-tight tracking-tight">
            Traits don&rsquo;t move alone
          </h1>
          <p className="mb-9 max-w-xl text-[15px] leading-relaxed text-bone/75">
            Read a row, not a cell: each row is a tag, and the row shows what
            share of <em>that tag&rsquo;s</em> references also carry each other
            tag. The matrix is deliberately not symmetric — 86% of one tag
            carrying another does not mean 86% the other way, and that
            difference is the part worth knowing.
          </p>
        </div>

        <dl className="mb-12 flex flex-wrap gap-x-14 gap-y-6 border-y border-white/10 py-6">
          {[
            { k: "Tags mapped", v: String(shownTags) },
            { k: "Above Early Signal", v: String(trustedTags) },
            { k: "Pairs observed", v: String(pairCount) },
            { k: "Axes", v: String(groups.length) },
          ].map(({ k, v }) => (
            <div key={k}>
              <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
                {k}
              </dt>
              <dd className="text-[26px] font-normal leading-none">{v}</dd>
            </div>
          ))}
        </dl>

        {directions.length > 0 && (
          <>
            <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
              One-way dependencies
            </p>
            <div className="mb-4 rounded-lg border border-white/10 bg-ink-2">
              {directions.map((d, i) => (
                <div
                  key={d.key}
                  className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4 ${
                    i > 0 ? "border-t border-white/10" : ""
                  }`}
                >
                  <span className="w-[52px] flex-none text-[19px] font-bold leading-none">
                    {Math.round(d.share * 100)}%
                  </span>
                  <span className="text-[15px] text-bone">
                    of <strong className="font-semibold">{d.from}</strong> also
                    carries <strong className="font-semibold">{d.to}</strong>
                  </span>
                  <span className="text-[13px] text-bone/70">
                    {d.both} of {d.fromTotal} references
                  </span>
                  <span className="ml-auto text-[13px] text-bone/70">
                    only {Math.round(d.backShare * 100)}% the other way
                  </span>
                </div>
              ))}
            </div>
            <p className="mb-12 max-w-xl text-xs leading-relaxed text-bone/70">
              Ranked by how lopsided the relationship is, not by how common it
              is. A tag with {String(EARLY_SIGNAL_MAX)} references or fewer is
              excluded from this list entirely — at that depth a single clip
              can produce a 100% share.
              {substrates.length > 0 && (
                <>
                  {" "}
                  {substrates.join(" and ")}{" "}
                  {substrates.length === 1 ? "shows" : "show"} up on the
                  receiving end more than once: several movements lean on{" "}
                  {substrates.length === 1 ? "it" : "them"} without being
                  leaned on back, which is what a substrate looks like — a
                  surface other looks are built on, not a look of its own.
                </>
              )}
            </p>
          </>
        )}

        <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
          The matrix — every tag, densest first
        </p>
        <p className="mb-5 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-bone/60">
          {groups.map((g) => (
            <span key={g}>
              <span className="font-semibold text-bone/80">
                {AXIS_SHORT[g] ?? g}
              </span>{" "}
              {AXIS_LABEL[g] ?? g}
            </span>
          ))}
        </p>
      </div>

      <div className="mx-auto max-w-[1180px] px-8 pb-12">
        <GenomeMatrix tags={tags} cells={cells} />
      </div>

      <div className="mx-auto max-w-[1180px] px-8">
        <footer className="border-t border-white/10 py-10">
          <p className="max-w-xl text-xs leading-relaxed text-bone/70">
            Co-occurrence is counted per reference, across the hand-clipped
            library only — a pair exists here because a human put both traits
            on the same image, never because a model inferred a relationship
            between them. Rows dimmed and marked Early Signal have too few
            references for their percentages to carry weight; they are drawn so
            the shape of the library stays honest, not so they can be quoted.
          </p>
        </footer>
      </div>
    </>
  );
}
