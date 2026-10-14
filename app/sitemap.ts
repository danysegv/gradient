import type { MetadataRoute } from "next";
import { supabasePublic } from "@/lib/supabase/public";
import { configuredSiteOrigin } from "@/lib/site-url";
import { isPublished } from "@/lib/legal";
import { isClassified } from "@/lib/clips/visibility";
import { boardHref } from "@/lib/boards/queries";
import { RECENT_WINDOW_DAYS } from "@/lib/velocity";

// What search engines are told exists (2026-10-14). Public pages only, the
// same ones a signed-out visitor can reach: the library, published looks,
// curators, public boards, and each classified clip's own page. The tools
// (/clip, /clip/team), account pages and the API are left out, and
// robots.txt asks crawlers to stay out of them too.
//
// Rebuilt at most once an hour; a failed read leaves that section out
// rather than failing the whole file.

export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = configuredSiteOrigin(process.env);
  const at = (path: string, extra: Omit<Entry, "url"> = {}): Entry => ({ url: `${base}${path}`, ...extra });

  const [tagsRes, clipsRes, boardsRes] = await Promise.all([
    supabasePublic.rpc("tag_velocity_counts", { window_days: RECENT_WINDOW_DAYS }),
    supabasePublic
      .from("clips")
      .select("id, clipped_at, clipped_by_name, clip_tags ( confidence )")
      .is("archived_at", null),
    supabasePublic.from("boards").select("owner_name, slug, updated_at").eq("is_public", true),
  ]);

  const entries: MetadataRoute.Sitemap = [
    at("/", { changeFrequency: "daily", priority: 1 }),
    at("/radar", { changeFrequency: "daily", priority: 0.8 }),
    at("/genome", { changeFrequency: "weekly", priority: 0.6 }),
    at("/curators", { changeFrequency: "weekly", priority: 0.6 }),
  ];
  if (isPublished("privacy")) entries.push(at("/privacy", { changeFrequency: "yearly", priority: 0.2 }));
  if (isPublished("rights")) entries.push(at("/rights", { changeFrequency: "yearly", priority: 0.2 }));

  // Looks: published ones that carry references.
  type TagRow = { editorial_name: string; is_published: boolean; clip_count: number | string; latest_reference_at: string | null };
  for (const t of (tagsRes.data ?? []) as TagRow[]) {
    if (!t.is_published || Number(t.clip_count) === 0) continue;
    entries.push(
      at(`/trend/${encodeURIComponent(t.editorial_name)}`, {
        lastModified: t.latest_reference_at ?? undefined,
        changeFrequency: "weekly",
        priority: 0.7,
      })
    );
  }

  // Clips the public can see (classified), and the curators behind them.
  type ClipRow = { id: string; clipped_at: string | null; clipped_by_name: string | null; clip_tags: { confidence: number | null }[] };
  const curators = new Map<string, string>();
  for (const c of (clipsRes.data ?? []) as unknown as ClipRow[]) {
    if (!isClassified(c.clip_tags)) continue;
    entries.push(at(`/clip/${c.id}`, { lastModified: c.clipped_at ?? undefined, changeFrequency: "monthly", priority: 0.5 }));
    if (c.clipped_by_name) {
      const prev = curators.get(c.clipped_by_name);
      if (!prev || (c.clipped_at && c.clipped_at > prev)) curators.set(c.clipped_by_name, c.clipped_at ?? "");
    }
  }
  for (const [name, last] of curators) {
    entries.push(at(`/curator/${encodeURIComponent(name)}`, { lastModified: last || undefined, changeFrequency: "weekly", priority: 0.6 }));
  }

  type BoardRow = { owner_name: string; slug: string; updated_at: string | null };
  for (const b of (boardsRes.data ?? []) as BoardRow[]) {
    entries.push(at(boardHref(b.owner_name, b.slug), { lastModified: b.updated_at ?? undefined, changeFrequency: "weekly", priority: 0.4 }));
  }

  return entries;
}
