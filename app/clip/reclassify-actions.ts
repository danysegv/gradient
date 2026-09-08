"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { CLIP_SESSION_COOKIE, isValidSessionToken } from "@/lib/clip-auth";
import { getClipsMissingIncubatingTags } from "@/lib/clips/unclassified";

// Bounds how many clips one click processes, keeping each run comfortably
// inside the route's execution window. Safe to click repeatedly — a clip
// drops out of the queue the moment it receives an incubating tag, so
// re-running only picks up what is left.
const BATCH_LIMIT = 20;

export type ReclassifyState =
  | { error: string; startedCount?: never; firstTags?: never }
  | { error?: never; startedCount: number; firstTags: number }
  | undefined;

/**
 * Applies the incubating vocabulary to every clip that does not carry it
 * yet — including the clips that have no tags at all.
 *
 * INCUBATING TAGS ONLY. It never writes a published tag and never
 * deletes, so no published clip_tags row is created, changed or removed
 * and no published figure can move. For the never-classified clips that
 * means they receive medium, subject and the widened axes now, and stay
 * outside the published numbers until a full classification pass after
 * launch — which is a deliberate choice, because writing their published
 * tags would add ~43 applications timestamped now, inside the trailing
 * window, and swamp a board whose whole range is ±2.5 points.
 *
 * ⚠ THE FIRST CLIP IS CLASSIFIED SYNCHRONOUSLY, ON PURPOSE.
 * Everything used to run inside after(), where a per-clip catch swallowed
 * the error to stop one bad clip killing a batch. When the Anthropic API
 * started rejecting every call, the button cheerfully reported "Started —
 * 20 clips processing" twenty-five minutes running while writing nothing.
 * A background job that cannot report its own failure is worse than one
 * that is slow. So the first clip runs in the request and its error comes
 * back to the screen; only if it succeeds do the rest go to the
 * background.
 */
export async function reclassifyUnclassifiedClips(): Promise<ReclassifyState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CLIP_SESSION_COOKIE)?.value;
  if (!isValidSessionToken(token)) {
    return { error: "Not authorized." };
  }

  let targets;
  try {
    targets = await getClipsMissingIncubatingTags(BATCH_LIMIT);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lookup failed." };
  }

  if (targets.length === 0) {
    return { startedCount: 0, firstTags: 0 };
  }

  // Dynamic import — same reasoning as app/clip/actions.ts: a missing or
  // bad ANTHROPIC_API_KEY must never break anything synchronous.
  const { classifyAndTagClipIncubatingOnly } = await import(
    "@/lib/claude/classify-clip"
  );

  const [probe, ...rest] = targets;

  let firstTags: number;
  try {
    firstTags = await classifyAndTagClipIncubatingOnly({
      id: probe.id,
      url: probe.url,
      imageUrl: probe.image_url,
      title: probe.title,
      caption: probe.caption,
    });
  } catch (err) {
    // The real reason, on screen, instead of a cheerful lie.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[reclassify] probe ${probe.id} (${probe.url}) failed:`, err);
    revalidatePath("/clip");
    return { error: `Classifier failed on the first clip — ${detail}` };
  }

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
          console.error(
            `[reclassify] ${clip.id} (${clip.url}) failed:`,
            err
          );
        }
      }
      console.log(`[reclassify] batch done — ${rest.length} clips processed`);
    });
  }

  revalidatePath("/clip");
  return { startedCount: targets.length, firstTags };
}
