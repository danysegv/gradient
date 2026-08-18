"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { CLIP_SESSION_COOKIE, isValidSessionToken } from "@/lib/clip-auth";
import { getUnclassifiedClips } from "@/lib/clips/unclassified";

// Bounds how many clips one click processes, keeping each run comfortably
// inside the route's execution window. Safe to click repeatedly — clips
// drop out of the eligible set as soon as they're tagged, so re-running
// just picks up whatever's left.
const BATCH_LIMIT = 20;

export type ReclassifyState =
  | { error: string; startedCount?: never }
  | { error?: never; startedCount: number }
  | undefined;

export async function reclassifyUnclassifiedClips(): Promise<ReclassifyState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CLIP_SESSION_COOKIE)?.value;
  if (!isValidSessionToken(token)) {
    return { error: "Not authorized." };
  }

  let targets;
  try {
    targets = await getUnclassifiedClips(BATCH_LIMIT);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lookup failed." };
  }

  if (targets.length === 0) {
    return { startedCount: 0 };
  }

  after(async () => {
    // Dynamic import — same reasoning as app/clip/actions.ts: keeps a
    // missing/bad ANTHROPIC_API_KEY from ever breaking anything synchronous.
    const { classifyAndTagClip } = await import("@/lib/claude/classify-clip");

    for (const clip of targets) {
      try {
        const count = await classifyAndTagClip({
          id: clip.id,
          url: clip.url,
          imageUrl: clip.image_url,
          title: clip.title,
          caption: clip.caption,
        });
        console.log(`[reclassify] ${clip.id}: ${count} tags`);
      } catch (err) {
        console.error(`[reclassify] ${clip.id} (${clip.url}) failed:`, err);
      }
    }
    console.log(`[reclassify] batch done — ${targets.length} clips processed`);
  });

  revalidatePath("/clip");
  return { startedCount: targets.length };
}
