import "server-only";
import { supabasePublic } from "@/lib/supabase/public";
import { onlyClassified } from "@/lib/clips/visibility";
import type { CuratorCardData } from "@/components/curator-card";

// Search reaches curators too (Daniela, 2026-09-25): a query that is a
// username or a display name — "lumalhaes", "@lumalhaes", "Luma" — finds
// the person, not just clips that happen to mention the word.
//
// Only the public columns are read: name and display_name. login_key and
// the rest of profiles never leave the server for this.

const LIMIT = 6;
const STRIP = 3;

/** For ilike: the query's own % and _ are literal characters, not wildcards. */
export function likePattern(q: string): string {
  const clean = q.trim().replace(/^@+/, "");
  return `%${clean.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export async function searchCurators(q: string): Promise<CuratorCardData[]> {
  const clean = q.trim().replace(/^@+/, "");
  if (clean.length < 2) return [];
  const pattern = likePattern(clean);

  const [byName, byDisplay] = await Promise.all([
    supabasePublic.from("profiles").select("name, display_name").ilike("name", pattern).limit(LIMIT),
    supabasePublic.from("profiles").select("name, display_name").ilike("display_name", pattern).limit(LIMIT),
  ]);
  if (byName.error) throw new Error(`searchCurators: ${byName.error.message}`);
  if (byDisplay.error) throw new Error(`searchCurators: ${byDisplay.error.message}`);

  // An exact username first, then the rest in the order they came.
  const seen = new Map<string, string | null>();
  for (const r of [...(byName.data ?? []), ...(byDisplay.data ?? [])] as { name: string; display_name: string | null }[]) {
    if (!seen.has(r.name)) seen.set(r.name, r.display_name);
  }
  const lower = clean.toLowerCase();
  const names = [...seen.keys()]
    .sort((a, b) => Number(b === lower) - Number(a === lower))
    .slice(0, LIMIT);
  if (names.length === 0) return [];

  // A few classified clips each, newest first, for the card's frame.
  const { data: pool } = await supabasePublic
    .from("clips")
    .select("id, image_url, title, clipped_by_name, clip_tags ( confidence )")
    .in("clipped_by_name", names)
    .is("archived_at", null)
    .not("image_url", "is", null)
    .order("clipped_at", { ascending: false })
    .limit(names.length * 20);
  type Row = { id: string; image_url: string | null; title: string | null; clipped_by_name: string | null; clip_tags: { confidence: number | null }[] | null };
  const strips = new Map<string, CuratorCardData["strip"]>();
  for (const c of onlyClassified((pool ?? []) as unknown as Row[], (r) => r.clip_tags)) {
    if (!c.clipped_by_name) continue;
    const list = strips.get(c.clipped_by_name) ?? [];
    if (list.length < STRIP) list.push({ id: c.id, image_url: c.image_url, title: c.title });
    strips.set(c.clipped_by_name, list);
  }

  return names.map((name) => ({ name, displayName: seen.get(name) ?? null, strip: strips.get(name) ?? [] }));
}
