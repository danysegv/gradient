import "server-only";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchOgImage } from "@/lib/og-image";
import { withSpendContext } from "@/lib/claude/spend-context";
import type { ClipInput } from "@/lib/clips/clip-input";
import { fetchImageForClassifier } from "@/lib/clips/image-bytes";

// Saving a clip, shared by both ways in: the /clip form (a Server Action)
// and the browser extension (a Route Handler). Moved here unchanged from
// app/clip/actions.ts on 2026-09-23 so the two can't drift — same insert,
// same enrichment, same order.
//
// The caller has already decided WHO is clipping, through
// lib/clip-session.ts. This module never reads a session.

export type CreatedClip = { id: string };

/** Said the moment a clip's image can't be read, on both ways in. */
export const IMAGE_UNREADABLE = "URL can’t be read.";

export async function insertClip(
  input: ClipInput,
  curatorName: string
): Promise<
  | { ok: true; clip: CreatedClip }
  | { ok: false; error: string; unreadable?: true }
> {
  // The door check (Daniela, 2026-09-25). A clip whose image can't be read
  // used to be saved anyway and wait on a "can't read" list until someone
  // fixed its URL. Now it is refused at the door, with the reason, and
  // there is no list: the curator finds a readable address while the page
  // is still open in front of them.
  //
  // "Readable" is exactly what the classifier's own fallback can read —
  // the same robots.txt check, the same browser-like fetch with the page
  // as referer, the same decode. If that can't get the image, the
  // classifier can't tag it. The bytes are dropped when this returns;
  // nothing is stored. A clip with no image URL skips the check and is
  // saved as before (the page's og:image is looked for afterwards).
  if (input.image_url) {
    const read = await fetchImageForClassifier(input.image_url, input.url);
    if (!read.image) {
      console.info(`[04am] refused a clip at the door: ${input.image_url} (${read.note})`);
      return { ok: false, error: IMAGE_UNREADABLE, unreadable: true };
    }
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("clips")
    .insert({
      url: input.url,
      image_url: input.image_url,
      title: input.title,
      caption: input.caption,
      // Structured attribution, replacing the single free-text `source`
      // field as of 2026-08-29. `source` is left null on new clips: the
      // column stays for the ~154 rows that predate this, and reading
      // code falls back to it. attribution_parsed_at stays null because
      // these were typed by a person, not inferred from a string — that
      // is exactly the distinction the column exists to record.
      creator: input.creator,
      rights_holder: input.rights_holder,
      found_via: input.found_via,
      source_year: input.source_year,
      clipped_at: new Date().toISOString(),
      clipped_by_name: curatorName,
    })
    .select("id, url, image_url, title, caption")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }

  scheduleEnrichment(inserted);
  return { ok: true, clip: { id: inserted.id } };
}

type InsertedRow = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  caption: string | null;
};

// Runs after the response is sent — saving stays instant. A clip with no
// fetchable image is still saved; it's just left unclassified.
function scheduleEnrichment(inserted: InsertedRow) {
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
      const imageUrl = effectiveImageUrl;
      await withSpendContext({ clipId: inserted.id, kind: "classify-full" }, () =>
        classifyAndTagClip({
          id: inserted.id,
          url: inserted.url,
          imageUrl,
          title: inserted.title,
          caption: inserted.caption,
        })
      );

      // Search descriptors. Separate from tagging and allowed to fail on
      // its own: a clip that can't be described is still tagged, and the
      // describe queue on /clip picks it up later.
      try {
        const { describeAndStoreClip } = await import("@/lib/claude/describe-clip");
        await describeAndStoreClip({
          id: inserted.id,
          url: inserted.url,
          imageUrl: effectiveImageUrl,
          title: inserted.title,
          caption: inserted.caption,
        });
      } catch (err) {
        console.error(`Describing clip ${inserted.id} for search failed:`, err);
      }
    } catch (err) {
      console.error(`Clip enrichment failed for clip ${inserted.id}:`, err);
    }
  });
}
