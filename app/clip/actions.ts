"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchOgImage } from "@/lib/og-image";

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
  // Server Actions are reachable via direct POST, so verify the Supabase
  // identity here instead of trusting Proxy coverage alone.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
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

  // This client carries the user's JWT. RLS therefore enforces that the
  // requested clipped_by value matches auth.uid(), rather than bypassing the
  // policy with the service-role client.
  const { data: inserted, error } = await supabase
    .from("clips")
    .insert({
      url,
      image_url: imageUrl,
      title: optionalText(formData, "title"),
      source: optionalText(formData, "source"),
      caption: optionalText(formData, "caption"),
      clipped_at: new Date().toISOString(),
      clipped_by: user.id,
    })
    .select("id, url, image_url, title, caption")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Insert failed." };
  }

  // Runs after the response is sent — pasting a URL stays instant. A clip
  // with no fetchable image is still saved; it's just left unclassified.
  after(async () => {
    try {
      let effectiveImageUrl = inserted.image_url;

      if (!effectiveImageUrl) {
        const fetched = await fetchOgImage(inserted.url);
        if (fetched) {
          effectiveImageUrl = fetched;
          await supabaseAdmin
            .from("clips")
            .update({ image_url: fetched })
            .eq("id", inserted.id);
        }
      }

      if (!effectiveImageUrl) return;

      // Dynamic import: keeps the Claude client (which throws if
      // ANTHROPIC_API_KEY is unset) out of the module graph until a clip
      // actually has an image to classify — a missing/bad key must never
      // break the save itself, only the enrichment step.
      const { classifyAndTagClip } = await import(
        "@/lib/claude/classify-clip"
      );
      await classifyAndTagClip({
        id: inserted.id,
        url: inserted.url,
        imageUrl: effectiveImageUrl,
        title: inserted.title,
        caption: inserted.caption,
      });
    } catch (err) {
      console.error(`Clip enrichment failed for clip ${inserted.id}:`, err);
    }
  });

  revalidatePath("/clip");
  return { success: true };
}
