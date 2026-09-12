"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { CLIP_SESSION_COOKIE, isValidSessionToken } from "@/lib/clip-auth";
import {
  getClipsNeedingClassification,
  parkClip,
  type ClassificationQueueClip,
} from "@/lib/clips/unclassified";

const BATCH_LIMIT = 20;

// How many clips the probe may burn through synchronously looking for one
// the classifier can actually read. Bounded because this runs inside the
// request: a run of unfetchable images must not turn into a timeout.
const MAX_PROBE_ATTEMPTS = 4;

export type ClassifyState =
  | {
      error: string;
      startedCount?: never;
      fullCount?: never;
      incubatingCount?: never;
      firstTags?: never;
      parked?: never;
    }
  | {
      error?: never;
      startedCount: number;
      fullCount: number;
      incubatingCount: number;
      firstTags: number;
      parked: number;
    }
  | undefined;

/**
 * One queue, two classifiers. clips_needing_classification hands back
 * every clip that needs work AND the mode it needs — mode 'full' for a
 * clip with zero published tags (runs classifyAndTagClip, the whole
 * vocabulary), mode 'incubating' for a clip that already has a published
 * tag and is only missing new vocabulary (runs
 * classifyAndTagClipIncubatingOnly). THE ROW DECIDES; THIS FILE NEVER
 * CHOOSES A MODE ITSELF — see scripts/clips-needing-classification.sql
 * for why those two modes can't be swapped: running the full classifier
 * on an already-published clip would write published applications
 * timestamped now and swamp a board's trailing window.
 *
 * Both write paths upsert with ignoreDuplicates, so a tag the clip
 * already carries is never touched or re-dated — panel drift is dated by
 * clip_tags.created_at.
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
 */
export async function classifyClips(): Promise<ClassifyState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CLIP_SESSION_COOKIE)?.value;
  if (!isValidSessionToken(token)) {
    return { error: "Not authorized." };
  }

  let targets: ClassificationQueueClip[];
  try {
    targets = await getClipsNeedingClassification(BATCH_LIMIT);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lookup failed." };
  }

  const fullCount = targets.filter((c) => c.mode === "full").length;
  const incubatingCount = targets.length - fullCount;

  if (targets.length === 0) {
    return { startedCount: 0, fullCount: 0, incubatingCount: 0, firstTags: 0, parked: 0 };
  }

  // Dynamic import — same reasoning as app/clip/actions.ts: a missing or
  // bad ANTHROPIC_API_KEY must never break anything synchronous.
  const { classifyAndTagClip, classifyAndTagClipIncubatingOnly, isUnreadableImageError } =
    await import("@/lib/claude/classify-clip");

  const classify = (clip: ClassificationQueueClip) => {
    const input = {
      id: clip.id,
      url: clip.url,
      imageUrl: clip.image_url,
      title: clip.title,
      caption: clip.caption,
    };
    return clip.mode === "full"
      ? classifyAndTagClip(input)
      : classifyAndTagClipIncubatingOnly(input);
  };

  let firstTags: number | null = null;
  let parked = 0;
  let index = 0;

  while (index < targets.length && index < MAX_PROBE_ATTEMPTS) {
    const clip = targets[index];
    try {
      firstTags = await classify(clip);
      index += 1;
      break;
    } catch (err) {
      if (!isUnreadableImageError(err)) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[classify] probe ${clip.id} failed:`, err);
        revalidatePath("/clip");
        return { error: `Classifier failed on the first clip — ${detail}` };
      }
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[classify] parking ${clip.id} (${clip.url}): ${detail}`);
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
          const count = await classify(clip);
          console.log(`[classify] ${clip.id}: ${count} tags (${clip.mode})`);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          if (isUnreadableImageError(err)) {
            console.warn(`[classify] parking ${clip.id}: ${detail}`);
            await parkClip(clip.id, detail);
          } else {
            console.error(`[classify] ${clip.id} (${clip.url}) failed:`, err);
          }
        }
      }
      console.log(`[classify] batch done — ${rest.length} clips processed`);
    });
  }

  revalidatePath("/clip");
  return {
    startedCount: rest.length + (firstTags === null ? 0 : 1),
    fullCount,
    incubatingCount,
    firstTags: firstTags ?? 0,
    parked,
  };
}
