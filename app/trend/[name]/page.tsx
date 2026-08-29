import Link from "next/link";
import { notFound } from "next/navigation";
import { supabasePublic } from "@/lib/supabase/public";
import {
  getConfidence,
  EARLY_SIGNAL_MAX,
  FULL_STAT_MIN,
  AGE_GATE_DAYS,
  COOLING_DAYS,
} from "@/lib/confidence";
import { confidenceNoteText } from "@/lib/confidence-display";
import { velocityFromCounts, RECENT_WINDOW_DAYS } from "@/lib/velocity";
import { Wordmark } from "@/components/wordmark";
import { HomeGrid, type FilterTag, type GridClip } from "@/components/home-grid";

export const revalidate = 0;

const CLIP_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const AXIS_LABEL: Record<string, string> = {
  movement: "Movement",
  typography: "Typography",
  palette_light: "Palette & Light",
  layout: "Layout",
  format_motion: "Format & Motion",
  treatment: "Treatment",
};

// PostgREST serialises bigint as a JSON string. Coerced at the boundary.
type RawTagRow = {
  tag_id: string;
  group: string;
  editorial_name: string;
  universal_term: string;
  clip_count: number | string;
  recent_count: number | string;
  earliest_reference_at: string | null;
  latest_reference_at: string | null;
};

type BreakdownRow = {
  curator: string;
  base_count: number | string;
  recent_count: number | string;
  curator_total: number | string;
};

type ClipTagRow = {
  confidence: number | null;
  tags: { editorial_name: string; group: string } | null;
};

type ClipRow = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  clipped_at: string;
  clip_tags: ClipTagRow[] | null;
};

function daysBetween(from: string, to: Date): number {
  return (to.getTime() - new Date(from).getTime()) / DAY_MS;
}

function fmt(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  // Resolve to the tag's canonical editorial_name rather than echoing the
  // URL — /trend/softserif must not title the tab "softserif" while the
  // page renders "SoftSerif". 21 rows, counts only.
  const requested = decodeURIComponent(name);
  const { data } = await supabasePublic.rpc("tag_velocity_counts", {
    window_days: RECENT_WINDOW_DAYS,
  });
  const match = ((data ?? []) as unknown as { editorial_name: string }[]).find(
    (t) => t.editorial_name.toLowerCase() === requested.toLowerCase()
  );
  return {
    title: `${match?.editorial_name ?? requested} — 04AM`,
    // Coupled to the curator-privacy decision: this page names who is
    // driving a tag. Drop the noindex once that is settled.
    robots: { index: false, follow: false },
  };
}

export default async function TrendPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const requested = decodeURIComponent(name);
  const now = new Date();

  // One RPC returns every tag with its counts — 21 rows. The tag is
  // resolved by matching in JS, so no user-controlled string ever reaches
  // a query and there is no wildcard surface to worry about.
  const { data: tagRows } = await supabasePublic.rpc("tag_velocity_counts", {
    window_days: RECENT_WINDOW_DAYS,
  });
  const allTags = ((tagRows ?? []) as unknown as RawTagRow[]).map((t) => ({
    ...t,
    clip_count: Number(t.clip_count),
    recent_count: Number(t.recent_count),
  }));

  const tag = allTags.find(
    (t) => t.editorial_name.toLowerCase() === requested.toLowerCase()
  );
  if (!tag) notFound();

  const baseTotalRefs = allTags.reduce((n, t) => n + t.clip_count, 0);
  const recentTotalRefs = allTags.reduce((n, t) => n + t.recent_count, 0);

  const velocity = velocityFromCounts({
    baseRefs: tag.clip_count,
    recentRefs: tag.recent_count,
    baseTotalRefs,
    recentTotalRefs,
  });

  const confidence = getConfidence({
    referenceCount: tag.clip_count,
    earliestReferenceAt: tag.earliest_reference_at,
    latestReferenceAt: tag.latest_reference_at,
    velocity,
    now,
    // The panel gate is not applied here yet — wiring it is coupled to the
    // homepage decision that is still with Luma. See the handoff.
  });

  // Reference ids first (bounded, archived excluded via the inner join),
  // then the full clips. Two round trips, but neither can silently return
  // a partial answer the way a JS-side filter over an unbounded fetch can.
  const { data: refRows } = await supabasePublic
    .from("clip_tags")
    .select("clip_id, clips!inner ( archived_at, clipped_at )")
    .eq("tag_id", tag.tag_id)
    .is("clips.archived_at", null)
    .order("clipped_at", { referencedTable: "clips", ascending: false })
    .limit(CLIP_LIMIT);

  const clipIds = ((refRows ?? []) as unknown as { clip_id: string }[]).map(
    (r) => r.clip_id
  );

  const [clipsRes, tagMetaRes, breakdownRes] = await Promise.all([
    clipIds.length
      ? supabasePublic
          .from("clips")
          .select(
            `id, url, image_url, title, source, clipped_at,
             clip_tags!inner ( confidence, tags ( editorial_name, group ) )`
          )
          .in("id", clipIds)
          .order("clipped_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabasePublic
      .from("tags")
      .select("description")
      .eq("id", tag.tag_id)
      .single(),
    supabasePublic.rpc("tag_curator_breakdown", {
      p_tag_id: tag.tag_id,
      window_days: RECENT_WINDOW_DAYS,
    }),
  ]);

  const clips = (clipsRes.data ?? []) as unknown as ClipRow[];
  const description =
    (tagMetaRes.data as unknown as { description: string | null } | null)
      ?.description ?? null;

  const breakdown = ((breakdownRes.data ?? []) as unknown as BreakdownRow[])
    .map((b) => ({
      curator: b.curator,
      base: Number(b.base_count),
      recent: Number(b.recent_count),
      total: Number(b.curator_total),
    }))
    .sort((a, b) => b.base - a.base);

  const gridClips: GridClip[] = clips.map((c) => ({
    id: c.id,
    url: c.url,
    image_url: c.image_url,
    title: c.title,
    source: c.source,
    tags: (c.clip_tags ?? [])
      .filter((ct) => ct.tags !== null)
      .map((ct) => ({
        editorial_name: ct.tags!.editorial_name,
        confidence: ct.confidence ?? 0,
      })),
  }));

  // Co-occurring tags, for the grid's own filter rail — what else shows up
  // on the same references is the interesting question on this page.
  const coTags = new Map<string, FilterTag>();
  for (const c of clips) {
    for (const ct of c.clip_tags ?? []) {
      if (!ct.tags) continue;
      // Skip the tag this page is about: every reference carries it, so
      // it is a filter that filters nothing.
      if (ct.tags.editorial_name === tag.editorial_name) continue;
      coTags.set(ct.tags.editorial_name, {
        tag_id: ct.tags.editorial_name,
        group: ct.tags.group,
        editorial_name: ct.tags.editorial_name,
      });
    }
  }

  // --- the confidence gates, each with its own verdict ------------------
  const ageDays = tag.earliest_reference_at
    ? daysBetween(tag.earliest_reference_at, now)
    : 0;
  const quietDays = tag.latest_reference_at
    ? daysBetween(tag.latest_reference_at, now)
    : 0;
  const gateLiftsAt = tag.earliest_reference_at
    ? new Date(new Date(tag.earliest_reference_at).getTime() + AGE_GATE_DAYS * DAY_MS)
    : null;

  const gates: {
    label: string;
    reading: string;
    requirement: string;
    passed: boolean;
  }[] = [
    {
      label: "Reference count",
      reading: `${tag.clip_count} references`,
      requirement: `${EARLY_SIGNAL_MAX + 1} to show velocity · ${FULL_STAT_MIN} for a full stat`,
      passed: tag.clip_count > EARLY_SIGNAL_MAX,
    },
    {
      label: "Reference age",
      reading: tag.earliest_reference_at
        ? `${Math.floor(ageDays)} days since first reference`
        : "no references yet",
      requirement:
        ageDays >= AGE_GATE_DAYS || !gateLiftsAt
          ? `${AGE_GATE_DAYS} days required`
          : `${AGE_GATE_DAYS} days required — lifts ${fmt(gateLiftsAt)}`,
      passed: ageDays >= AGE_GATE_DAYS,
    },
    {
      label: "Still live",
      reading: tag.latest_reference_at
        ? `last reference ${Math.floor(quietDays)} days ago`
        : "never referenced",
      requirement: `flagged Cooling after ${COOLING_DAYS} days quiet`,
      passed: !confidence.cooling && tag.latest_reference_at !== null,
    },
  ];
  const holding = gates.filter((g) => !g.passed);

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
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone">
            Trend
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
            {AXIS_LABEL[tag.group] ?? tag.group} — trend detail
          </p>
          <h1 className="mb-2.5 text-[34px] font-bold leading-tight tracking-tight">
            {tag.editorial_name}
          </h1>
          <p className="mb-9 max-w-xl text-[15px] leading-relaxed text-bone/75">
            {tag.universal_term}
            {description ? ` — ${description}` : ""}
          </p>
        </div>

        <dl className="mb-12 flex flex-wrap gap-x-14 gap-y-6 border-y border-white/10 py-6">
          {[
            { k: "References", v: String(tag.clip_count) },
            { k: `Last ${RECENT_WINDOW_DAYS} days`, v: String(tag.recent_count) },
            { k: "Velocity", v: confidenceNoteText(confidence) },
            {
              k: "First seen",
              v: tag.earliest_reference_at ? fmt(tag.earliest_reference_at) : "—",
            },
            {
              k: "Last seen",
              v: tag.latest_reference_at ? fmt(tag.latest_reference_at) : "—",
            },
          ].map(({ k, v }) => (
            <div key={k}>
              <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
                {k}
              </dt>
              <dd className="text-[26px] font-normal leading-none">{v}</dd>
            </div>
          ))}
        </dl>

        {/* The page's actual argument: not "no data", but exactly which
            gate is holding and when it lifts. */}
        <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
          Why this number reads the way it does
        </p>
        <div className="mb-4 rounded-lg border border-white/10 bg-ink-2">
          {gates.map((g, i) => (
            <div
              key={g.label}
              className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4 ${
                i > 0 ? "border-t border-white/10" : ""
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-2.5 w-2.5 flex-none translate-y-px ${
                  g.passed ? "bg-bone/30" : "bg-oxide"
                }`}
              />
              <span className="w-[128px] flex-none text-[13px] font-semibold uppercase tracking-wide text-bone">
                {g.label}
              </span>
              <span className="text-[15px] text-bone">{g.reading}</span>
              <span className="ml-auto text-[13px] text-bone/70">
                {g.requirement}
              </span>
              <span className="w-[68px] flex-none text-right text-[11px] font-semibold uppercase tracking-wide text-bone/70">
                {g.passed ? "Clear" : "Holding"}
              </span>
            </div>
          ))}
        </div>
        <p className="mb-12 max-w-xl text-xs leading-relaxed text-bone/70">
          {holding.length === 0
            ? `All gates clear — the velocity figure above is the trailing ${RECENT_WINDOW_DAYS}-day share of references for this tag, minus its share of the library overall, in percentage points.`
            : `${holding.length === 1 ? "One gate is" : `${holding.length} gates are`} still holding, so no velocity number is shown. 04AM would rather show nothing than a figure computed from too little.`}
        </p>

        {breakdown.length > 0 && (
          <>
            <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
              Who is driving it
            </p>
            <div className="mb-12 rounded-lg border border-white/10 bg-ink-2">
              {breakdown.map((b, i) => {
                const shareOfTag = Math.round((b.base / tag.clip_count) * 100);
                const shareOfTheirs = Math.round((b.base / b.total) * 100);
                return (
                  <div
                    key={b.curator}
                    className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4 ${
                      i > 0 ? "border-t border-white/10" : ""
                    }`}
                  >
                    <Link
                      href={`/curator/${encodeURIComponent(b.curator)}`}
                      className="w-[128px] flex-none text-[15px] font-bold underline decoration-bone/30 underline-offset-4 hover:decoration-bone"
                    >
                      {b.curator}
                    </Link>
                    <span className="text-[15px] text-bone">
                      {b.base} references
                    </span>
                    <span className="text-[13px] text-bone/70">
                      {shareOfTag}% of this tag
                    </span>
                    <span className="ml-auto text-[13px] text-bone/70">
                      {shareOfTheirs}% of everything they clip
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
          References ({clips.length})
        </p>
      </div>

      <HomeGrid clips={gridClips} filterTags={[...coTags.values()]} />

      <div className="mx-auto max-w-[1180px] px-8">
        <footer className="border-t border-white/10 py-10">
          <p className="max-w-xl text-xs leading-relaxed text-bone/70">
            Every reference here was clipped by hand and classified against a
            locked taxonomy. The gates above are deliberately conservative —
            a tag reads Early Signal until its reference set is both deep
            enough and old enough to mean anything.
          </p>
        </footer>
      </div>
    </>
  );
}
