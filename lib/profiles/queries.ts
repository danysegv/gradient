import "server-only";
import { supabasePublic } from "@/lib/supabase/public";

// What a curator writes about themselves. The username is still the
// identity — it comes from the clip data, not from here — and display_name
// (2026-09-20) is only what a page prints above it.

export type CuratorProfile = {
  name: string;
  display_name: string | null;
  bio: string | null;
  /** The stable key this curator signs in with. Never changes on a rename —
   * see lib/profiles/username.ts and the rename_curator function. */
  login_key: string;
  /** When they last changed their username, for the cooldown. */
  name_changed_at: string | null;
};

const SELECT = "name, display_name, bio, login_key, name_changed_at";

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

/** The current name of the profile that signs in with this key. */
export async function nameForLoginKey(loginKey: string): Promise<string | null> {
  const { data, error } = await supabasePublic
    .from("profiles")
    .select("name")
    .eq("login_key", loginKey)
    .maybeSingle();
  if (error) throw new Error(`nameForLoginKey(${loginKey}): ${error.message}`);
  return (data as { name: string } | null)?.name ?? null;
}

/**
 * A username this profile used to hold resolves to the name it holds now,
 * so a link shared before a rename still lands on the right person. Returns
 * null when the name was never used, which is a 404 rather than a redirect.
 */
export async function currentNameForOldName(
  oldName: string
): Promise<string | null> {
  const { data, error } = await supabasePublic
    .from("profile_name_history")
    .select("login_key")
    .eq("old_name", oldName.toLowerCase())
    .maybeSingle();
  if (error) {
    throw new Error(`currentNameForOldName(${oldName}): ${error.message}`);
  }
  const key = (data as { login_key: string } | null)?.login_key;
  return key ? await nameForLoginKey(key) : null;
}
