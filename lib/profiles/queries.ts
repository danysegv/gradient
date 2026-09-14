import "server-only";
import { supabasePublic } from "@/lib/supabase/public";

export type CuratorProfile = {
  name: string;
  /** What to call them. Null means fall back to the handle. */
  display_name: string | null;
  bio: string | null;
  /** Ready to put in a src, or null. Cache-busted — see below. */
  avatar_url: string | null;
};

type Row = {
  name: string;
  display_name: string | null;
  bio: string | null;
  avatar_path: string | null;
  updated_at: string;
};

/**
 * The avatar's public URL.
 *
 * A curator's avatar always lives at the same key (their name plus an
 * extension) so uploading replaces rather than accumulates — which means
 * the URL never changes either, and a browser or CDN that cached the old
 * file would keep serving it after a new upload. profiles.updated_at is
 * bumped on every write, so hanging it off the URL makes each upload a
 * different address without leaving an orphan behind.
 */
function avatarUrl(row: Row): string | null {
  if (!row.avatar_path) return null;
  const { data } = supabasePublic.storage
    .from("avatars")
    .getPublicUrl(row.avatar_path);
  if (!data?.publicUrl) return null;
  return `${data.publicUrl}?v=${Date.parse(row.updated_at) || 0}`;
}

const toProfile = (row: Row): CuratorProfile => ({
  name: row.name,
  display_name: row.display_name,
  bio: row.bio,
  avatar_url: avatarUrl(row),
});

const SELECT = "name, display_name, bio, avatar_path, updated_at";

export async function getProfile(name: string): Promise<CuratorProfile | null> {
  const { data, error } = await supabasePublic
    .from("profiles")
    .select(SELECT)
    .eq("name", name.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`getProfile(${name}): ${error.message}`);
  return data ? toProfile(data as unknown as Row) : null;
}

/** Profiles for a roster, keyed by name. Names with no row are simply absent. */
export async function getProfiles(
  names: readonly string[]
): Promise<Map<string, CuratorProfile>> {
  if (names.length === 0) return new Map();
  const { data, error } = await supabasePublic
    .from("profiles")
    .select(SELECT)
    .in("name", names.map((n) => n.toLowerCase()));
  if (error) throw new Error(`getProfiles: ${error.message}`);
  return new Map(
    ((data ?? []) as unknown as Row[]).map((r) => [r.name, toProfile(r)])
  );
}
