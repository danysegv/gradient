import Link from "next/link";
import { supabasePublic } from "@/lib/supabase/public";
import { Wordmark } from "@/components/wordmark";

export const revalidate = 0;

export const metadata = {
  title: "The Vocabulary — 04AM",
  description:
    "Every tag 04AM reads a reference against, across eight axes — and the thirty-seven still incubating.",
  // Deliberately indexable. The four noindex surfaces are noindex because
  // they carry curator names, pending that decision. This page carries
  // none: it is the taxonomy as text.
};

// PostgREST serialises bigint as a JSON string. Coerced at the boundary.
type RawRow = {
  tag_id: string;
  group: string;
  editorial_name: string;
  universal_term: string;
  description: string;
  is_published: boolean;
  reference_count: number | string;
};

type Tag = Omit<RawRow, "reference_count"> & { reference_count: number };

// Reading order, not database order: the five axes that have been carrying
// the library first, then the two new ones, then the dead one last.
const AXIS_ORDER = [
  "movement",
  "typography",
  "palette_light",
  "layout",
  "treatment",
  "medium",
  "subject",
  "format_motion",
];

const AXIS_LABEL: Record<string, string> = {
  movement: "Movement",
  typography: "Typography",
  palette_light: "Palette & Light",
  layout: "Layout",
  treatment: "Treatment",
  medium: "Medium",
  subject: "Subject",
  format_motion: "Format & Motion",
};

const AXIS_NOTE: Record<string, string> = {
  movement: "The register a piece is working in.",
  typography: "How the lettering behaves.",
  palette_light: "Colour, and the light it was made under.",
  layout: "How the frame is organised.",
  treatment: "What has been done to the surface.",
  medium: "What kind of object it actually is.",
  subject: "What is actually depicted.",
  format_motion: "Time-based formats. Nothing in the library uses them yet.",
};

function rank(group: string): number {
  const i = AXIS_ORDER.indexOf(group);
  return i === -1 ? AXIS_ORDER.length : i;
}

export default async function TaxonomyPage() {
  const { data } = await supabasePublic.rpc("taxonomy_catalog");

  const tags: Tag[] = ((data ?? []) as unknown as RawRow[]).map((t) => ({
    ...t,
    reference_count: Number(t.reference_count),
  }));

  const byAxis = new Map<string, Tag[]>();
  for (const t of tags) {
    const list = byAxis.get(t.group) ?? [];
    list.push(t);
    byAxis.set(t.group, list);
  }

  // Within an axis: the working vocabulary first, heaviest first, then the
  // incubating words alphabetically. The page should read as "here is what
  // the library runs on, and here is what is coming".
  const axes = [...byAxis.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([group, list]) => ({
      group,
      tags: [...list].sort((a, b) => {
        if (a.is_published !== b.is_published) return a.is_published ? -1 : 1;
        if (a.reference_count !== b.reference_count)
          return b.reference_count - a.reference_count;
        return a.editorial_name.localeCompare(b.editorial_name);
      }),
    }));

  const total = tags.length;
  const published = tags.filter((t) => t.is_published).length;
  const incubating = total - published;

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
          <Link
            href="/curators"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Curators
          </Link>
          {/* Radar stays inert until velocity has a run of days to plot. */}
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone/55">
            Radar
          </span>
          <Link
            href="/genome"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Genome
          </Link>
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone">
            Vocabulary
          </span>
          <Link
            href="/clip"
            className="rounded bg-oxide px-4 py-2 text-[13px] font-semibold tracking-wide text-bone"
          >
            + Clip
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8 pb-24">
        <div className="pt-11 pb-2">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 flex-none bg-oxide"
            />
            The Vocabulary — {total} tags across {axes.length} axes
          </p>
          <h1 className="mb-2.5 text-[34px] font-bold leading-tight tracking-tight">
            Every word the system knows
          </h1>
          <p className="mb-4 max-w-xl text-[15px] leading-relaxed text-bone/75">
            A reference is read against each axis and takes at most one tag
            from it. That is what keeps the axes comparable: a clip either
            carries a trait or it doesn&rsquo;t, and no axis can be won by
            saying the same thing twice.
          </p>
          <p className="mb-9 max-w-xl text-[15px] leading-relaxed text-bone/75">
            {incubating} of these are <strong>incubating</strong> — in the
            vocabulary, and not in the numbers. They sit outside every
            published figure, on both sides of the fraction, until they have
            built enough history to mean something. A word has to earn a
            number.
          </p>
        </div>

        <dl className="mb-14 flex flex-wrap gap-x-14 gap-y-6 border-y border-white/10 py-6">
          {[
            { k: "Tags", v: String(total) },
            { k: "Axes", v: String(axes.length) },
            { k: "In the numbers", v: String(published) },
            { k: "Incubating", v: String(incubating) },
          ].map(({ k, v }) => (
            <div key={k}>
              <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
                {k}
              </dt>
              <dd className="text-[26px] font-normal leading-none">{v}</dd>
            </div>
          ))}
        </dl>

        {axes.map(({ group, tags: axisTags }) => {
          const axisIncubating = axisTags.filter((t) => !t.is_published).length;
          return (
            <section key={group} className="mb-14">
              <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-white/10 pb-3">
                <h2 className="text-[19px] font-bold leading-tight tracking-tight">
                  {AXIS_LABEL[group] ?? group}
                </h2>
                <p className="text-[13px] leading-relaxed text-bone/70">
                  {AXIS_NOTE[group]}
                </p>
                <p className="ml-auto text-xs font-normal uppercase tracking-wide text-bone/70">
                  {axisTags.length} tags
                  {axisIncubating > 0 ? ` · ${axisIncubating} incubating` : ""}
                </p>
              </div>

              <ul>
                {axisTags.map((t) => (
                  <li
                    key={t.tag_id}
                    className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 border-b border-white/5 py-4 last:border-b-0"
                  >
                    <div className="w-[220px] min-w-0 flex-none">
                      <p className="text-[15px] font-semibold leading-tight">
                        {t.editorial_name}
                      </p>
                      <p className="mt-1 text-[13px] leading-tight text-bone/70">
                        {t.universal_term}
                      </p>
                    </div>

                    <p className="min-w-0 flex-1 basis-[280px] text-[14px] leading-relaxed text-bone/75">
                      {t.description}
                    </p>

                    <div className="w-[92px] flex-none text-right">
                      {t.is_published ? (
                        <p className="text-[15px] font-normal leading-none text-bone/75">
                          {t.reference_count}
                          <span className="ml-1 text-[11px] uppercase tracking-wide text-bone/70">
                            {t.reference_count === 1 ? "ref" : "refs"}
                          </span>
                        </p>
                      ) : (
                        // Bone, not Slate. Cooling in Slate is the one
                        // documented exception in the identity system and
                        // this is not it.
                        <span className="inline-block rounded border border-white/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-bone/70">
                          Incubating
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <p className="max-w-xl text-xs leading-relaxed text-bone/70">
          Reference counts are a tag&rsquo;s own applications across the active
          library — a count, not a rate. Incubating tags show none at all: a
          number attached to a word the system has only just learned would be
          describing the vocabulary, not the work.
        </p>
      </div>
    </>
  );
}
