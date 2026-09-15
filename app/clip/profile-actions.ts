"use server";

import { revalidatePath } from "next/cache";
import { getSessionCurator } from "@/lib/clip-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseProfileInput } from "@/lib/profiles/input";

// A curator editing their own bio. Writes profiles.bio and nothing else —
// no clip, no tag, no figure is touched.
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
  if (!curator) return { error: "Sign in at /clip-login to edit your profile." };

  const { bio } = parseProfileInput(formData);

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ bio, updated_at: new Date().toISOString() })
    .eq("name", curator);
  if (error) return { error: error.message };

  revalidatePath("/clip");
  revalidatePath(`/curator/${curator}`);
  revalidatePath("/curators");
  return { ok: true };
}
