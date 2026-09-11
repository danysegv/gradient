import "server-only";
import { supabasePublic } from "@/lib/supabase/public";
import type { GridClip } from "@/components/home-grid";
import { orderByIds } from "./query";

// Clip search. search_clips ranks every active clip by its tags, Claude's
// description of the image, its title and its credits, and returns ids
// only — the description text never leaves the database.

export type ClipSearch = {
  ids: string[];
  /** false when nothing matched every word and these match any of them */
  exact: boolean;
};

export async function searchClipIds(q: string): Promise<ClipSearch> {
  if (!q) return { ids: [], exact: true };
  const { data, error } = await supabasePublic.rpc("search_clips", { q });
  if (error) throw new Error(`search_clips: ${error.message}`);
  const rows = (data ?? []) as { clip_id: string; exact: boolean }[];
  return {
    ids: rows.map((r) => r.clip_id),
    exact: rows.length === 0 || rows.every((r) => r.exact),
  };
}

type Row = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  creator: string | null;
  rights_holder: string | null;
  clipped_by_name: string | null;
  clip_tags: { confidence: number | null; tags: { editorial_name: string } | null }[] | null;
};

// .in() travels in the URL; chunked so a broad search can't outgrow it.
const CHUNK = 100;

/** Grid-ready clips for these ids, in the order given. */
export async function fetchGridClips(
  ids: string[],
  opts: { curator?: string } = {}
): Promise<GridClip[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map((chunk) => {
      let query = supabasePublic
        .from("clips")
        .select(
          `id, url, image_url, title, source, creator, rights_holder, clipped_by_name,
           clip_tags ( confidence, tags ( editorial_name ) )`
        )
        .in("id", chunk)
        .is("archived_at", null);
      if (opts.curator) query = query.eq("clipped_by_name", opts.curator);
      return query;
    })
  );

  const rows: Row[] = [];
  for (const r of results) {
    if (r.error) throw new Error(`fetchGridClips: ${r.error.message}`);
    rows.push(...((r.data ?? []) as unknown as Row[]));
  }

  return orderByIds(rows, ids).map((c) => ({
    id: c.id,
    url: c.url,
    image_url: c.image_url,
    title: c.title,
    source: c.creator ?? c.rights_holder ?? c.source,
    tags: (c.clip_tags ?? [])
      .filter((ct) => ct.tags !== null)
      .map((ct) => ({
        editorial_name: ct.tags!.editorial_name,
        confidence: ct.confidence ?? 0,
      })),
  }));
}
