"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSessionCurator } from "@/lib/clip-session";
import {
  getClipsMissingDescriptions,
  parkClip,
  type UnclassifiedClip,
} from "@/lib/clips/unclassified";

// Describes clips for search, a batch at a time. Same shape as
// classify-actions.ts, for the same hard-won reasons:
//
// - The FIRST clip is described inside the request, so an account-level
//   failure (credits, auth, rate limit) reaches the screen instead of
//   vanishing into after().
// - An unreadable image parks the clip and the probe moves on; any other
//   error aborts. Parking on an error we don't understand would quietly
//   drain the queue.
//
// Writes clip_descriptions only. No tag is created, changed or removed.

const BATCH_LIMIT = 20;
const MAX_PROBE_ATTEMPTS = 4;

export type DescribeState =
  | { error: string; startedCount?: never; firstKeywords?: never; parked?: never }
  | { error?: never; startedCount: number; firstKeywords: number; parked: number }
  | undefined;

export async function describeClipsForSearch(): Promise<DescribeState> {
  if (!(await getSessionCurator())) return { error: "Not authorized." };

  let targets: UnclassifiedClip[];
  try {
    targets = await getClipsMissingDescriptions(BATCH_LIMIT);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lookup failed." };
  }
  if (targets.length === 0) return { startedCount: 0, firstKeywords: 0, parked: 0 };

  const { describeAndStoreClip } = await import("@/lib/claude/describe-clip");
  const { isUnreadableImageError } = await import("@/lib/claude/classify-clip");
  const input = (c: UnclassifiedClip) => ({
    id: c.id,
    url: c.url,
    imageUrl: c.image_url,
    title: c.title,
    caption: c.caption,
  });

  let firstKeywords: number | null = null;
  let parked = 0;
  let index = 0;
  while (index < targets.length && index < MAX_PROBE_ATTEMPTS) {
    const clip = targets[index];
    try {
      firstKeywords = await describeAndStoreClip(input(clip));
      index += 1;
      break;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (!isUnreadableImageError(err)) {
        console.error(`[describe] probe ${clip.id} failed:`, err);
        revalidatePath("/clip");
        return { error: `Describing the first clip failed — ${detail}` };
      }
      console.warn(`[describe] parking ${clip.id} (${clip.url}): ${detail}`);
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
          const n = await describeAndStoreClip(input(clip));
          console.log(`[describe] ${clip.id}: ${n} keywords`);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          if (isUnreadableImageError(err)) {
            console.warn(`[describe] parking ${clip.id}: ${detail}`);
            await parkClip(clip.id, detail);
          } else {
            console.error(`[describe] ${clip.id} (${clip.url}) failed:`, err);
          }
        }
      }
      console.log(`[describe] batch done — ${rest.length} clips processed`);
    });
  }

  revalidatePath("/clip");
  return {
    startedCount: rest.length + (firstKeywords === null ? 0 : 1),
    firstKeywords: firstKeywords ?? 0,
    parked,
  };
}
