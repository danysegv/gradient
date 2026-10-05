import Link from "next/link";
import { supabasePublic } from "@/lib/supabase/public";
import { EARLY_SIGNAL_MAX } from "@/lib/confidence";
import { oneWays, type GenomeLook, type GenomePair } from "@/lib/genome";
import { loaded, LIBRARY_UNAVAILABLE } from "@/lib/query-result";
import { GenomeMatrix } from "./genome-matrix";
import { SiteHeader } from "@/components/site-header";

export const revalidate = 0;

export const metadata = {
  title: "Visual Genome — 04AM",
  description: "Which visual traits travel together, and in which direction.",
};

// PostgREST serialises bigint as a JSON string. Coerced at the boundary.
type RawRow = {
  from_tag_id: string;
  from_name: string;
  from_group: string;
  from_total: number | string;
  from_published: boolean;
  to_tag_id: string;
  to_name: string;
  both_count: number | string;
};

// The matrix stays — it is what the genome looks like — organised by axis,
// sized to the screen, and quiet (Daniela, 2026-10-01). Co-occurrence is
// counted per reference across the hand-clipped library, over the whole
// vocabulary: incubating looks are in the grid, marked in Slate, and kept
// out of the one-way pulls (see lib/genome.ts and scripts/genome-all.sql).
export default async function GenomePage() {
  const res = await supabasePublic.rpc("tag_cooccurrence_all");
  const load = loaded<RawRow>("tag_cooccurrence_all", res);

  const byId = new Map<string, GenomeLook>();
  const pairs: GenomePair[] = [];
  for (const r of load.rows) {
    const total = Number(r.from_total);
    if (!byId.has(r.from_tag_id)) {
      byId.set(r.from_tag_id, {
        id: r.from_tag_id,
        name: r.from_name,
        group: r.from_group,
        total,
        early: total <= EARLY_SIGNAL_MAX,
        incubating: !r.from_published,
      });
    }
    pairs.push({ from: r.from_tag_id, to: r.to_tag_id, both: Number(r.both_count) });
  }
  const looks = [...byId.values()];
  const pulls = oneWays(byId, pairs, 5);
  const pairCount = pairs.filter((p) => p.both > 0 && p.from < p.to).length;

  return (
    <>
      <SiteHeader active="genome" />
      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-4 sm:px-8">
        <div className="pt-11 pb-2">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
            Visual Genome · what travels with what
          </p>
          <h1 className="mb-9 text-[34px] font-bold leading-tight tracking-tight">
            Traits don&rsquo;t move alone
          </h1>
        </div>

        {load.failed ? (
          <p className="mb-16 border-y border-white/10 py-10 text-[14px] text-bone/75">{LIBRARY_UNAVAILABLE}</p>
        ) : (
          <>
            <dl className="mb-10 flex flex-wrap gap-x-14 gap-y-6 border-y border-white/10 py-6">
              {[
                { k: "Published looks", v: String(looks.filter((l) => !l.incubating).length) },
                { k: "Incubating", v: String(looks.filter((l) => l.incubating).length) },
                { k: "Pairs", v: String(pairCount) },
                { k: "One-way pulls", v: String(pulls.length) },
              ].map(({ k, v }) => (
                <div key={k}>
                  <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">{k}</dt>
                  <dd className="text-[26px] font-normal leading-none tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>

            <GenomeMatrix looks={looks} pairs={pairs} />

            {pulls.length > 0 && (
              <section className="mt-14 mb-20 border-t border-white/10 pt-7">
                <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/70">
                  <span aria-hidden className="inline-block h-2 w-2 bg-oxide" />
                  The strongest one-way pulls
                </p>
                <ul className="divide-y divide-white/[.07] border-y border-white/[.07]">
                  {pulls.map((o) => (
                    <li
                      key={`${o.from.id}>${o.to.id}`}
                      title={`${o.both} of ${o.from.total} references`}
                      className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-0.5 py-3.5 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
                    >
                      <span className="text-[22px] font-normal leading-none tabular-nums sm:text-[26px]">
                        {Math.round(o.share * 100)}%
                      </span>
                      <span className="min-w-0 text-[14px] text-bone/75">
                        of{" "}
                        <Link href={`/trend/${encodeURIComponent(o.from.name)}`} className="font-semibold text-bone hover:underline">
                          {o.from.name}
                        </Link>{" "}
                        carries{" "}
                        <Link href={`/trend/${encodeURIComponent(o.to.name)}`} className="font-semibold text-bone hover:underline">
                          {o.to.name}
                        </Link>
                      </span>
                      <span className="col-start-2 text-[12px] text-bone/50 sm:col-start-auto sm:text-right">
                        {Math.round(o.back * 100)}% the other way
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
