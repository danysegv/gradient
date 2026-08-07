"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CLIP_SESSION_COOKIE, isValidSessionToken } from "@/lib/clip-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type CreateClipState =
  | { error: string; success?: never }
  | { error?: never; success: true }
  | undefined;

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function createClip(
  _prevState: CreateClipState,
  formData: FormData
): Promise<CreateClipState> {
  // Server Actions are reachable via direct POST — re-verify here even
  // though Proxy already gates the /clip route.
  const cookieStore = await cookies();
  const token = cookieStore.get(CLIP_SESSION_COOKIE)?.value;
  if (!isValidSessionToken(token)) {
    return { error: "Not authorized." };
  }

  const url = formData.get("url");
  if (typeof url !== "string" || !isValidUrl(url)) {
    return { error: "Enter a valid URL." };
  }

  const imageUrl = optionalText(formData, "image_url");
  if (imageUrl && !isValidUrl(imageUrl)) {
    return { error: "Image URL isn't valid." };
  }

  const { error } = await supabaseAdmin.from("clips").insert({
    url,
    image_url: imageUrl,
    title: optionalText(formData, "title"),
    source: optionalText(formData, "source"),
    caption: optionalText(formData, "caption"),
    clipped_at: new Date().toISOString(),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/clip");
  return { success: true };
}
