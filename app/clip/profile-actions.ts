"use server";

import { revalidatePath } from "next/cache";
import { getSessionCurator } from "@/lib/clip-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  parseProfileInput,
  checkAvatar,
  avatarPath,
  AVATAR_MAX_BYTES,
} from "@/lib/profiles/input";

// A curator editing their own profile. Writes profiles only — no clip, no
// tag, no figure is touched.
//
// Authorisation is the session curator and nothing else: a curator may edit
// exactly the row matching their own name, taken from the cookie rather
// than from the form, so a submitted name can't be used to write someone
// else's profile. Same reason boards take their owner from the session.
//
// Uploads go through the service role because curators are shared-secret
// sessions, not Supabase Auth users — there is no auth.uid() for a storage
// policy to check, so the check has to live here.

export type ProfileState =
  | { error: string; ok?: never }
  | { error?: never; ok: true }
  | undefined;

const PROBLEM: Record<string, string> = {
  type: "That needs to be a JPEG, PNG, WebP or AVIF.",
  size: `That image is over ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB.`,
  missing: "Choose an image first.",
};

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const curator = await getSessionCurator();
  if (!curator) return { error: "Sign in at /clip-login to edit your profile." };

  const { display_name, bio } = parseProfileInput(formData);

  const file = formData.get("avatar");
  const hasUpload = file instanceof File && file.size > 0;
  let newPath: string | null = null;

  if (hasUpload) {
    const problem = checkAvatar(file);
    if (problem) return { error: PROBLEM[problem] };

    newPath = avatarPath(curator, file.type);
    const { error: uploadError } = await supabaseAdmin.storage
      .from("avatars")
      .upload(newPath, file, { contentType: file.type, upsert: true });
    if (uploadError) return { error: `Upload failed — ${uploadError.message}` };

    // Uploading a different format leaves the old file behind, since the
    // key carries the extension. Remove every other extension for this
    // curator so exactly one avatar exists per person.
    const stale = ["jpg", "png", "webp", "avif"]
      .map((ext) => `${curator.toLowerCase()}.${ext}`)
      .filter((p) => p !== newPath);
    await supabaseAdmin.storage.from("avatars").remove(stale);
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      display_name,
      bio,
      // updated_at is what cache-busts the avatar URL, so it is bumped on
      // every save, not only when the image changed.
      updated_at: new Date().toISOString(),
      ...(newPath ? { avatar_path: newPath } : {}),
    })
    .eq("name", curator);
  if (error) return { error: error.message };

  revalidatePath("/clip");
  revalidatePath(`/curator/${curator}`);
  revalidatePath("/curators");
  return { ok: true };
}

/** Remove the picture, keeping the name and bio. */
export async function removeAvatar(): Promise<ProfileState> {
  const curator = await getSessionCurator();
  if (!curator) return { error: "Sign in at /clip-login to edit your profile." };

  await supabaseAdmin.storage
    .from("avatars")
    .remove(["jpg", "png", "webp", "avif"].map((e) => `${curator}.${e}`));

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ avatar_path: null, updated_at: new Date().toISOString() })
    .eq("name", curator);
  if (error) return { error: error.message };

  revalidatePath("/clip");
  revalidatePath(`/curator/${curator}`);
  revalidatePath("/curators");
  return { ok: true };
}
