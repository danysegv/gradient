"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { CLIP_SESSION_COOKIE, isValidSessionToken } from "@/lib/clip-auth";
import { getClipsMissingIncubatingTags } from "@/lib/clips/unclassified";

// Same ceiling as the reclassify batch, same reason: keep one click
// comfortably inside the route's execution window. Safe to click
// repeatedly — a clip drops out of the queue the moment it receives an
// incubating tag, so re-running only picks up what is left and no clip is
// ever sent to claude-opus-5 twice.
const BATCH_LIMIT = 20;

export type BackfillState =
  | { error: string; startedCount?: never }
  | { error?: never; startedCount: number }
  | undefined;

// Applies the incubating vocabulary to clips that do not carry any of it
// yet. WRITES ONLY INCUBATING TAGS AND NEVER DELETES — see
// classifyAndTagClipIncubatingOnly for why that is the whole safety
// argument: no published clip_tags row is created, changed or removed, so
// no published figure can move.
export async function backfillIncubatingTags(): Promise<BackfillState> {
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
    return { startedCount: 0 };
  }

  after(async () => {
    // Dynamic import — same reasoning as app/clip/actions.ts: a
    // missing or bad ANTHROPIC_API_KEY must never break anything
    // synchronous.
    const { classifyAndTagClipIncubatingOnly } = await import(
      "@/lib/claude/classify-clip"
    );

    for (const clip of targets) {
      try {
        const count = await classifyAndTagClipIncubatingOnly({
          id: clip.id,
          url: clip.url,
          imageUrl: clip.image_url,
          title: clip.title,
          caption: clip.caption,
        });
        console.log(`[backfill] ${clip.id}: ${count} incubating tags`);
      } catch (err) {
        console.error(`[backfill] ${clip.id} (${clip.url}) failed:`, err);
      }
    }
    console.log(`[backfill] batch done — ${targets.length} clips processed`);
  });

  revalidatePath("/clip");
  return { startedCount: targets.length };
}
