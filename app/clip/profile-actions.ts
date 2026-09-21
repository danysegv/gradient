"use server";

import { revalidatePath } from "next/cache";
import { getSessionCurator, getSessionLoginKey } from "@/lib/clip-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseProfileInput } from "@/lib/profiles/input";
import { parseUsername, RENAME_COOLDOWN_DAYS } from "@/lib/profiles/username";

// A curator editing their own profile. Writes profiles.display_name and
// profiles.bio and nothing else — no clip, no tag, no figure is touched.
// The username is never written from a form: it is the credit on every clip.
//
// Authorisation is the session curator and nothing else: the row edited is
// the one matching the name in the cookie, never a name from the form, so a
// submitted value can't be used to write someone else's profile. Same reason
// boards take their owner from the session.

export type ProfileState =
  | { error: string; ok?: never }
  | { error?: never; ok: true }
  | undefined;

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const curator = await getSessionCurator();
  if (!curator) return { error: "Sign in to edit your profile." };

  const { displayName, bio } = parseProfileInput(formData);

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      display_name: displayName,
      bio,
      updated_at: new Date().toISOString(),
    })
    .eq("name", curator);
  if (error) return { error: error.message };

  revalidatePath("/clip");
  revalidatePath(`/curator/${curator}`);
  revalidatePath("/curators");
  return { ok: true };
}

// Changing a username. Everything this moves — the credit on every clip,
// the owner of every board, the identity row the panel gate groups by, the
// profile itself — moves inside one database function (rename_curator), so
// a half-renamed curator can't exist. The old name stays reserved and
// redirecting; see lib/profiles/queries.ts.
//
// Authorisation is the session's LOGIN KEY, never a name from the form: the
// key is what the cookie proves, and it is what survives the rename.
export async function renameUsername(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const loginKey = await getSessionLoginKey();
  if (!loginKey) return { error: "Sign in to edit your profile." };
  const previous = await getSessionCurator();

  const parsed = parseUsername(formData.get("username"));
  if (!parsed.ok) return { error: parsed.error };

  const { data, error } = await supabaseAdmin.rpc("rename_curator", {
    p_login_key: loginKey,
    p_new_name: parsed.value,
  });
  if (error) return { error: error.message };

  switch (data as string) {
    case "ok":
      break;
    case "same":
      return { error: "That's already your username." };
    case "taken":
      return { error: "That username is taken." };
    case "cooldown":
      return {
        error: `A username can only be changed once every ${RENAME_COOLDOWN_DAYS} days.`,
      };
    default:
      return { error: "No profile to rename yet." };
  }

  revalidatePath("/clip");
  revalidatePath("/curators");
  revalidatePath(`/curator/${parsed.value}`);
  if (previous) revalidatePath(`/curator/${previous}`);
  return { ok: true };
}
