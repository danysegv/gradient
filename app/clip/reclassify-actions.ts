"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { CLIP_SESSION_COOKIE, isValidSessionToken } from "@/lib/clip-auth";
import {
  getClipsMissingIncubatingTags,
  parkClip,
  type UnclassifiedClip,
} from "@/lib/clips/unclassified";

const BATCH_LIMIT = 20;

// How many clips the probe may burn through synchronously looking for one
// the classifier can actually read. Bounded because this runs inside the
// request: a run of unfetchable images must not turn into a timeout.
const MAX_PROBE_ATTEMPTS = 4;

export type ReclassifyState =
  | { error: string; startedCount?: never; firstTags?: never; parked?: never }
  | { error?: never; startedCount: number; firstTags: number; parked: number }
  | undefined;

/**
 * Applies the incubating vocabulary to every clip that does not carry it
 * yet — including the clips that have no tags at all.
 *
 * INCUBATING TAGS ONLY. Never writes a published tag, never deletes, so
 * no published figure can move.
 *
 * ⚠ THE FIRST CLIP IS CLASSIFIED IN THE REQUEST, ON PURPOSE.
 * Everything used to run inside after(), where the per-clip catch that
 * stops one bad clip killing a batch also swallowed account-level
 * failures. When credits ran out the button reported "Started — 20 clips
 * processing" for twenty-five minutes while writing nothing.
 *
 * But a probe that aborts on ANY failure is the opposite mistake: one
 * clip with a dead image URL then blocks every clip behind it forever.
 * So the probe distinguishes the two:
 *
 *   unreadable image  -> park the clip, try the next one
 *   anything else     -> abort and put the real error on screen
 *
 * Unknown errors take the second path deliberately. Parking clips on an
 * error we do not understand would quietly drain the queue.
 */
export async function reclassifyUnclassifiedClips(): Promise<ReclassifyState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CLIP_SESSION_COOKIE)?.value;
  if (!isValidSessionToken(token)) {
    return { error: "Not authorized." };
  }

  let targets: UnclassifiedClip[];
  try {
    targets = await getClipsMissingIncubatingTags(BATCH_LIMIT);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lookup failed." };
  }

  if (targets.length === 0) {
    return { startedCount: 0, firstTags: 0, parked: 0 };
  }

  // Dynamic import — same reasoning as app/clip/actions.ts: a missing or
  // bad ANTHROPIC_API_KEY must never break anything synchronous.
  const { classifyAndTagClipIncubatingOnly, isUnreadableImageError } =
    await import("@/lib/claude/classify-clip");

  let firstTags: number | null = null;
  let parked = 0;
  let index = 0;

  while (index < targets.length && index < MAX_PROBE_ATTEMPTS) {
    const clip = targets[index];
    try {
      firstTags = await classifyAndTagClipIncubatingOnly({
        id: clip.id,
        url: clip.url,
        imageUrl: clip.image_url,
        title: clip.title,
        caption: clip.caption,
      });
      index += 1;
      break;
    } catch (err) {
      if (!isUnreadableImageError(err)) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[reclassify] probe ${clip.id} failed:`, err);
        revalidatePath("/clip");
        return { error: `Classifier failed on the first clip — ${detail}` };
      }
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[reclassify] parking ${clip.id} (${clip.url}): ${detail}`);
      await parkClip(clip.id, detail);
      parked += 1;
      index += 1;
    }
  }

  const rest = targets.slice(index);

  if (rest.length > 0) {
    after(async () => {
      for (const clip of rest) {
        try {
          const count = await classifyAndTagClipIncubatingOnly({
            id: clip.id,
            url: clip.url,
            imageUrl: clip.image_url,
            title: clip.title,
            caption: clip.caption,
          });
          console.log(`[reclassify] ${clip.id}: ${count} incubating tags`);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          if (isUnreadableImageError(err)) {
            console.warn(`[reclassify] parking ${clip.id}: ${detail}`);
            await parkClip(clip.id, detail);
          } else {
            console.error(`[reclassify] ${clip.id} (${clip.url}) failed:`, err);
          }
        }
      }
      console.log(`[reclassify] batch done — ${rest.length} clips processed`);
    });
  }

  revalidatePath("/clip");
  return {
    startedCount: rest.length + (firstTags === null ? 0 : 1),
    firstTags: firstTags ?? 0,
    parked,
  };
}
