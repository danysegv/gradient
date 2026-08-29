"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { CLIP_SESSION_COOKIE, sessionCurator } from "@/lib/clip-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

// The year the WORK was made — never the clip date, which velocity depends
// on. Validated here so a typo returns a sentence rather than a Postgres
// check-constraint violation. Mirrors clips_source_year_plausible.
const YEAR_MIN = 1400;

function optionalYear(
  formData: FormData
): { year: number | null } | { error: string } {
  const raw = optionalText(formData, "source_year");
  if (raw === null) return { year: null };
  const year = Number(raw);
  const max = new Date().getUTCFullYear() + 1;
  if (!Number.isInteger(year) || year < YEAR_MIN || year > max) {
    return { error: `Work year must be a whole number between ${YEAR_MIN} and ${max}.` };
  }
  return { year };
}

export async function createClip(
  _prevState: CreateClipState,
  formData: FormData
): Promise<CreateClipState> {
  // Server Actions are reachable via direct POST — re-verify here even
  // though Proxy already gates the /clip route.
  const cookieStore = await cookies();
  const token = cookieStore.get(CLIP_SESSION_COOKIE)?.value;
  const curatorName = sessionCurator(token);
  if (!curatorName) {
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

  const yearResult = optionalYear(formData);
  if ("error" in yearResult) {
    return { error: yearResult.error };
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("clips")
    .insert({
      url,
      image_url: imageUrl,
      title: optionalText(formData, "title"),
      caption: optionalText(formData, "caption"),
      // Structured attribution, replacing the single free-text `source`
      // field as of 2026-08-29. `source` is left null on new clips: the
      // column stays for the ~154 rows that predate this, and reading
      // code falls back to it. attribution_parsed_at stays null because
      // these were typed by a person, not inferred from a string — that
      // is exactly the distinction the column exists to record.
      creator: optionalText(formData, "creator"),
      rights_holder: optionalText(formData, "rights_holder"),
      found_via: optionalText(formData, "found_via"),
      source_year: yearResult.year,
      clipped_at: new Date().toISOString(),
      clipped_by_name: curatorName,
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
