import "server-only";
import { supabasePublic } from "@/lib/supabase/public";

// A curator's bio. The username is the name — it comes from the clip data,
// not from here — so this carries the one thing a curator writes about
// themselves and nothing else.

export type CuratorProfile = { name: string; bio: string | null };

const SELECT = "name, bio";

export async function getProfile(name: string): Promise<CuratorProfile | null> {
  const { data, error } = await supabasePublic
    .from("profiles")
    .select(SELECT)
    .eq("name", name.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`getProfile(${name}): ${error.message}`);
  return (data as CuratorProfile | null) ?? null;
}

/** Bios for a roster, keyed by name. A name with no row is simply absent. */
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
    ((data ?? []) as CuratorProfile[]).map((r) => [r.name, r])
  );
}
