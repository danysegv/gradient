"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSessionCurator } from "@/lib/clip-session";
import {
  getClipsMissingColors,
  parkClip,
  type UnclassifiedClip,
} from "@/lib/clips/unclassified";

// Reads the dominant colours of each clip, a batch at a time, for the
// swatch row under the search bar. Same shape as describe-actions.ts, for
// the same hard-won reasons:
//
// - The FIRST clip is described inside the request, so an account-level
//   failure (credits, auth, rate limit) reaches the screen instead of
//   vanishing into after().
// - An unreadable image parks the clip and the probe moves on; any other
//   error aborts. Parking on an error we don't understand would quietly
//   drain the queue.
//
// Writes clip_colors only. It deliberately does NOT rewrite the clip's
// description: those summaries and keywords are what search has been
// ranking on, and replacing them all to add colour would quietly change
// every existing search result. No tag is created, changed or removed.

const BATCH_LIMIT = 20;
const MAX_PROBE_ATTEMPTS = 4;

export type ColorState =
  | { error: string; startedCount?: never; firstColors?: never; parked?: never }
  | { error?: never; startedCount: number; firstColors: number; parked: number }
  | undefined;

export async function colorClipsForSearch(): Promise<ColorState> {
  if (!(await getSessionCurator())) return { error: "Not authorized." };

  let targets: UnclassifiedClip[];
  try {
    targets = await getClipsMissingColors(BATCH_LIMIT);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lookup failed." };
  }
  if (targets.length === 0) return { startedCount: 0, firstColors: 0, parked: 0 };

  const { colorAndStoreClip } = await import("@/lib/claude/describe-clip");
  const { isUnreadableImageError } = await import("@/lib/claude/classify-clip");
  const input = (c: UnclassifiedClip) => ({
    id: c.id,
    url: c.url,
    imageUrl: c.image_url,
    title: c.title,
    caption: c.caption,
  });

  let firstColors: number | null = null;
  let parked = 0;
  let index = 0;
  while (index < targets.length && index < MAX_PROBE_ATTEMPTS) {
    const clip = targets[index];
    try {
      firstColors = await colorAndStoreClip(input(clip));
      index += 1;
      break;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (!isUnreadableImageError(err)) {
        console.error(`[color] probe ${clip.id} failed:`, err);
        revalidatePath("/clip");
        return { error: `Reading the first clip's colours failed — ${detail}` };
      }
      console.warn(`[color] parking ${clip.id} (${clip.url}): ${detail}`);
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
          const n = await colorAndStoreClip(input(clip));
          console.log(`[color] ${clip.id}: ${n} colours`);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          if (isUnreadableImageError(err)) {
            console.warn(`[color] parking ${clip.id}: ${detail}`);
            await parkClip(clip.id, detail);
          } else {
            console.error(`[color] ${clip.id} (${clip.url}) failed:`, err);
          }
        }
      }
      console.log(`[color] batch done — ${rest.length} clips processed`);
    });
  }

  revalidatePath("/clip");
  return {
    startedCount: rest.length + (firstColors === null ? 0 : 1),
    firstColors: firstColors ?? 0,
    parked,
  };
}
