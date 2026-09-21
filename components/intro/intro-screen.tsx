import { supabasePublic } from "@/lib/supabase/public";
import { loaded } from "@/lib/query-result";
import { AXIS_LABEL } from "@/lib/axes";
import { Intro, type IntroClip } from "@/components/intro/intro";

// Server half of the intro: a light read of real clips (image, title,
// source, tags) so every image and every tag the intro animates is one the
// library actually holds. Never selects curator columns, and never computes
// a figure — the only number shown is the library's own clip count.

const INTRO_CLIP_LIMIT = 90;

type Row = {
  id: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  clipped_at: string;
  clip_tags: {
    confidence: number | null;
    tags: { editorial_name: string; group: string } | null;
  }[] | null;
};

export async function IntroScreen({
  linkProblem = null,
}: {
  linkProblem?: "expired" | "invalid" | null;
} = {}) {
  const [clipsRes, statsRes, firstRes] = await Promise.all([
    supabasePublic
      .from("clips")
      .select(
        `id, image_url, title, source, clipped_at,
         clip_tags!inner ( confidence, tags ( editorial_name, group ) )`
      )
      .is("archived_at", null)
      .not("image_url", "is", null)
      .order("clipped_at", { ascending: false })
      .limit(INTRO_CLIP_LIMIT),
    supabasePublic.rpc("library_clip_stats").single(),
    supabasePublic
      .from("clips")
      .select("clipped_at")
      .is("archived_at", null)
      .order("clipped_at", { ascending: true })
      .limit(1),
  ]);

  const rows = loaded<Row>("intro clips", clipsRes).rows;
  const clips: IntroClip[] = rows
    .filter((r) => r.image_url)
    .map((r) => ({
      id: r.id,
      image_url: r.image_url!,
      title: r.title,
      source: r.source,
      tags: (r.clip_tags ?? [])
        // Same floor search uses: a weak match is not shown as a reading.
        .filter((ct) => ct.tags && (ct.confidence ?? 0) >= 0.5)
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .map((ct) => ({
          name: ct.tags!.editorial_name,
          axis: AXIS_LABEL[ct.tags!.group] ?? ct.tags!.group,
        })),
    }));

  const stats = statsRes.error
    ? null
    : (statsRes.data as { total_clips: number | string } | null);
  const total = stats ? Number(stats.total_clips) : null;
  const first = (firstRes.data?.[0] as { clipped_at: string } | undefined)?.clipped_at ?? null;

  return <Intro clips={clips} total={total} since={first} linkProblem={linkProblem} />;
}
