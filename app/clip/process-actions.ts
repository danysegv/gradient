"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSessionCurator } from "@/lib/clip-session";
import {
  getClipsNeedingClassification,
  getClipsMissingDescriptions,
  parkClip,
  type UnclassifiedClip,
} from "@/lib/clips/unclassified";

// One button for the whole enrichment pipeline. Three queues used to mean
// three buttons and three rounds of clicking for what is, per clip, at most
// two Claude calls. This runs whatever each clip is actually missing.
//
// IT CHANGES NO PROMPT, NO IMAGE AND NO MODEL. The classifier still runs on
// Opus against the frozen prompt, the describer still runs on Haiku, and
// they are still separate calls — merging them into one request is the
// post-09-26 cut (worth ~5x, validated by re-tagging ~30 clips and
// comparing), and doing it early would change the measuring instrument the
// launch board is derived from. This is an operator convenience, nothing
// more, and it costs exactly what the three buttons cost.
//
// Per clip the work is:
//   classify        - mode 'full' or 'incubating'; THE ROW DECIDES, never
//                     this file (see classify-actions.ts for why)
//   describe        - writes clip_descriptions AND clip_colors, one call
//   colour only     - for clips described before colour existed; does not
//                     rewrite the description
//
// Probe semantics are inherited from classify-actions.ts for the same
// hard-won reason: the FIRST clip is processed inside the request, so an
// account-level failure (credits, auth, rate limit) reaches the screen
// instead of vanishing into after(). An unreadable image parks the clip and
// the probe moves on; any other error aborts.

const BATCH_LIMIT = 20;
const MAX_PROBE_ATTEMPTS = 4;

type Step = "classify-full" | "classify-incubating" | "describe";
type Work = { clip: UnclassifiedClip; steps: Step[] };

export type ProcessState =
  | {
      error: string;
      startedCount?: never;
      steps?: never;
      parked?: never;
      remaining?: never;
    }
  | {
      error?: never;
      startedCount: number;
      /** color is always 0 — kept so the button's shape doesn't churn. */
      steps: { classify: number; describe: number; color: number };
      parked: number;
      remaining: number;
    }
  | undefined;

async function buildQueue(): Promise<{ work: Work[]; total: number }> {
  const [needsClassification, needsDescription] = await Promise.all([
    getClipsNeedingClassification(),
    getClipsMissingDescriptions(),
  ]);

  const byId = new Map<string, Work>();
  const add = (clip: UnclassifiedClip, step: Step) => {
    const found = byId.get(clip.id);
    if (found) {
      if (!found.steps.includes(step)) found.steps.push(step);
      return;
    }
    byId.set(clip.id, { clip, steps: [step] });
  };

  // Classification first, so a clip that needs everything gets its tags in
  // the same pass rather than waiting for a later batch.
  for (const c of needsClassification) {
    add(c, c.mode === "full" ? "classify-full" : "classify-incubating");
  }
  for (const c of needsDescription) add(c, "describe");
  // COLOURS ARE NOT BOUGHT ANY MORE. scripts/read-colors.ts reads them from
  // the pixels for nothing, and the launchd watcher runs it every 15
  // minutes, so a model's estimate is overwritten before anyone sees it —
  // we were paying a Haiku call with a full-size image for an answer with
  // a fifteen-minute shelf life. 5% of the cost of every clip, spent on
  // something thrown away.
  //
  // The count still appears on /clip, but as a status rather than as
  // work: a clip with no colours is waiting on the watcher, not on money.
  // If that number stops falling the watcher is dead — see
  // scripts/install-colour-watcher.sh — which is an operational problem,
  // not a reason to start paying again.

  const work = [...byId.values()];
  return { work, total: work.length };
}

async function runSteps(
  work: Work,
  tally: { classify: number; describe: number; color: number }
): Promise<void> {
  const input = {
    id: work.clip.id,
    url: work.clip.url,
    imageUrl: work.clip.image_url,
    title: work.clip.title,
    caption: work.clip.caption,
  };

  for (const step of work.steps) {
    if (step === "classify-full") {
      const { classifyAndTagClip } = await import("@/lib/claude/classify-clip");
      await classifyAndTagClip(input);
      tally.classify += 1;
    } else if (step === "classify-incubating") {
      const { classifyAndTagClipIncubatingOnly } = await import(
        "@/lib/claude/classify-clip"
      );
      await classifyAndTagClipIncubatingOnly(input);
      tally.classify += 1;
    } else if (step === "describe") {
      const { describeAndStoreClip } = await import("@/lib/claude/describe-clip");
      await describeAndStoreClip(input);
      tally.describe += 1;
    }
  }
}

export async function processClips(): Promise<ProcessState> {
  if (!(await getSessionCurator())) return { error: "Not authorized." };

  let queue: { work: Work[]; total: number };
  try {
    queue = await buildQueue();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lookup failed." };
  }
  if (queue.total === 0) {
    return {
      startedCount: 0,
      steps: { classify: 0, describe: 0, color: 0 },
      parked: 0,
      remaining: 0,
    };
  }

  const batch = queue.work.slice(0, BATCH_LIMIT);
  const { isUnreadableImageError } = await import("@/lib/claude/classify-clip");
  const tally = { classify: 0, describe: 0, color: 0 };

  let parked = 0;
  let index = 0;
  let probed = false;
  while (index < batch.length && index < MAX_PROBE_ATTEMPTS) {
    const item = batch[index];
    try {
      await runSteps(item, tally);
      index += 1;
      probed = true;
      break;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (!isUnreadableImageError(err)) {
        console.error(`[process] probe ${item.clip.id} failed:`, err);
        revalidatePath("/clip");
        return { error: `The first clip failed — ${detail}` };
      }
      console.warn(`[process] parking ${item.clip.id} (${item.clip.url}): ${detail}`);
      await parkClip(item.clip.id, detail);
      parked += 1;
      index += 1;
    }
  }

  const rest = batch.slice(index);
  if (rest.length > 0) {
    after(async () => {
      for (const item of rest) {
        try {
          await runSteps(item, tally);
          console.log(`[process] ${item.clip.id}: ${item.steps.join(", ")}`);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          if (isUnreadableImageError(err)) {
            console.warn(`[process] parking ${item.clip.id}: ${detail}`);
            await parkClip(item.clip.id, detail);
          } else {
            console.error(`[process] ${item.clip.id} (${item.clip.url}) failed:`, err);
          }
        }
      }
      console.log(`[process] batch done — ${rest.length} clips`);
    });
  }

  revalidatePath("/clip");
  return {
    startedCount: rest.length + (probed ? 1 : 0),
    steps: tally,
    parked,
    remaining: Math.max(queue.total - batch.length, 0),
  };
}
