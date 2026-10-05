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
import { fetchFrozenAxes } from "@/lib/taxonomy-freeze";
import { velocityFromCounts, RECENT_WINDOW_DAYS } from "@/lib/velocity";
import { HomeGrid, type GridClip } from "@/components/home-grid";
import { SiteHeader } from "@/components/site-header";

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
  is_published: boolean;
};


type ClipTagRow = {
  confidence: number | null;
  tags: { editorial_name: string; group: string } | null;
};

type ClipRow = {
  id: string;
  url: string;
  image_url: string | null;
  alt_text: string | null;
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
  // No match means this request is about to 404 — do not title the tab
  // with the string the visitor mistyped.
  return {
    title: match ? `${match.editorial_name} — 04AM` : "Not found — 04AM",
    // Indexable since curator names were decided public (2026-09-11).
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

  // Denominators over the PUBLISHED vocabulary only — an incubating tag
  // is not part of the total these shares are shares of. See
  // lib/taxonomy-freeze.ts.
  const publishedTags = allTags.filter((t) => t.is_published);
  const baseTotalRefs = publishedTags.reduce((n, t) => n + t.clip_count, 0);
  const recentTotalRefs = publishedTags.reduce(
    (n, t) => n + t.recent_count,
    0
  );

  // Never computed for an incubating tag: it is absent from both
  // denominators above, so the figure would be a share of a total the tag
  // was not part of. getConfidence withholds it too — belt and braces,
  // because this is the number the whole freeze exists to protect.
  const velocity = tag.is_published
    ? velocityFromCounts({
        baseRefs: tag.clip_count,
        recentRefs: tag.recent_count,
        baseTotalRefs,
        recentTotalRefs,
      })
    : null;

  // Empty until the 37 frozen tags land — no behaviour change today.
  const frozenAxes = await fetchFrozenAxes(supabasePublic);

  const confidence = getConfidence({
    referenceCount: tag.clip_count,
    earliestReferenceAt: tag.earliest_reference_at,
    latestReferenceAt: tag.latest_reference_at,
    velocity,
    now,
    coolingSuspended: frozenAxes.has(tag.group),
    isPublished: tag.is_published,
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

  const [clipsRes, tagMetaRes] = await Promise.all([
    clipIds.length
      ? supabasePublic
          .from("clips")
          .select(
            `id, url, image_url, alt_text, title, source, clipped_at,
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
  ]);

  const clips = (clipsRes.data ?? []) as unknown as ClipRow[];
  const description =
    (tagMetaRes.data as unknown as { description: string | null } | null)
      ?.description ?? null;


  const gridClips: GridClip[] = clips.map((c) => ({
    id: c.id,
    url: c.url,
    image_url: c.image_url,
    alt_text: c.alt_text,
    title: c.title,
    source: c.source,
    tags: (c.clip_tags ?? [])
      .filter((ct) => ct.tags !== null)
      .map((ct) => ({
        editorial_name: ct.tags!.editorial_name,
        confidence: ct.confidence ?? 0,
      })),
  }));

  // --- the confidence gates, each with its own verdict ------------------
  const ageDays = tag.earliest_reference_at
    ? daysBetween(tag.earliest_reference_at, now)
    : 0;
  const gateLiftsAt = tag.earliest_reference_at
    ? new Date(new Date(tag.earliest_reference_at).getTime() + AGE_GATE_DAYS * DAY_MS)
    : null;

  // Three checks, each a word or two; the rule behind each is on hover.
  const gates: { label: string; hint: string; passed: boolean }[] = [
    {
      label: tag.clip_count > EARLY_SIGNAL_MAX ? `${tag.clip_count} references` : `${tag.clip_count} of ${EARLY_SIGNAL_MAX + 1} references`,
      hint: `A number needs ${EARLY_SIGNAL_MAX + 1} references; ${FULL_STAT_MIN} for a full stat.`,
      passed: tag.clip_count > EARLY_SIGNAL_MAX,
    },
    {
      label:
        ageDays >= AGE_GATE_DAYS || !gateLiftsAt ? "Old enough" : `Ready ${fmt(gateLiftsAt)}`,
      hint: `First seen at least ${AGE_GATE_DAYS} days ago.`,
      passed: ageDays >= AGE_GATE_DAYS,
    },
    {
      label: !confidence.cooling && tag.latest_reference_at !== null ? "Active" : "Quiet",
      hint: `Clipped in the last ${COOLING_DAYS} days.`,
      passed: !confidence.cooling && tag.latest_reference_at !== null,
    },
  ];
  const holding = gates.filter((g) => !g.passed);
  const movementUp = confidence.velocity !== null && confidence.velocity > 0;

  return (
    <>
      <SiteHeader />

      {/* Less text, still self-explaining (Daniela, 2026-10-01): figures,
          three checks and a bar per curator; every rule is on hover. */}
      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-4 sm:px-8">
        <div className="pt-11 pb-2">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
            {AXIS_LABEL[tag.group] ?? tag.group}
          </p>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">{tag.editorial_name}</h1>
          <p className="mt-1.5 text-[15px] text-bone/75">{tag.universal_term}</p>
          {description && (
            <p className="mt-3 mb-9 max-w-xl text-[13px] leading-relaxed text-bone/55">{description}</p>
          )}
          {!description && <div className="mb-9" />}
        </div>

        <dl className="mb-8 flex flex-wrap gap-x-14 gap-y-6 border-y border-white/10 py-6">
          {[
            { k: "References", v: String(tag.clip_count), cls: "" },
            { k: `Last ${RECENT_WINDOW_DAYS} days`, v: String(tag.recent_count), cls: "" },
            { k: "Movement", v: confidenceNoteText(confidence), cls: movementUp ? "text-oxide" : "" },
          ].map(({ k, v, cls }) => (
            <div key={k}>
              <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">{k}</dt>
              <dd className={`text-[26px] font-normal leading-none tabular-nums ${cls}`}>{v}</dd>
            </div>
          ))}
        </dl>

        <ul className="mb-2 flex flex-wrap gap-2.5" aria-label="Before a number is shown">
          {gates.map((g) => (
            <li
              key={g.hint}
              title={g.hint}
              className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-bone/85"
            >
              <span
                aria-hidden
                className={`inline-block h-2 w-2 flex-none ${g.passed ? "bg-bone/35" : "bg-oxide"}`}
              />
              {g.label}
            </li>
          ))}
        </ul>
        <p className="mb-12 min-h-[1em] text-[11.5px] text-bone/50">
          {holding.length > 0 && "The number shows once all three clear."}
        </p>


        <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
          References <span className="font-normal tabular-nums text-bone/45">{clips.length}</span>
        </p>
      </div>

      <HomeGrid clips={gridClips} />
      <div className="h-24" />
    </>
  );
}
