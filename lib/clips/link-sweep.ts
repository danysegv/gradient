import "server-only";
// The daily link check (Daniela, 2026-10-16). Called by Vercel Cron through
// app/api/links/run/route.ts. Rules and the meaning of "gone" live in
// lib/clips/link-check.ts; this file only reads clips, asks, and writes.
//
// Each run checks the clips checked longest ago (never-checked first), so
// the whole library cycles every few days. Per clip: image and source page,
// then strikes; on the third strike the clip is archived like any other
// archive (it leaves every count, share and velocity, Daniela chose this),
// with archived_reason = 'link_gone', and its curator gets a notification.
//
// Two brakes, because a mistake here hides real work:
//   - if a run sees too many "gone" answers at once, something is wrong on
//     our side (DNS, the network), so that run archives nothing;
//   - at most MAX_ARCHIVES_PER_RUN clips are archived per run.
// And a curator who restores a link-archived clip has the last word: the
// clip is marked link_kept and never checked again (archive-actions.ts).

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/server";
import { checkLink, nextState, type LinkResult } from "./link-check.ts";

export const BATCH_SIZE = 160;
/** Stop starting new checks after this, well inside the 300s function limit. */
const TIME_BUDGET_MS = 200_000;
const CONCURRENCY = 6;
const PER_HOST = 2;
export const MAX_ARCHIVES_PER_RUN = 10;
/** Share of checked clips answering "gone" above which the run stands down. */
export const STAND_DOWN_SHARE = 0.3;

type Row = {
  id: string;
  url: string | null;
  image_url: string | null;
  link_strikes: number;
  link_last_strike_at: string | null;
};

export type SweepReport = {
  checked: number;
  ok: number;
  gone: number;
  unsure: number;
  archived: string[];
  stoodDown: boolean;
  errors: number;
};

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};

/** Runs tasks CONCURRENCY at a time, never more than PER_HOST on one host. */
async function pool<T>(items: T[], hostKey: (t: T) => string, run: (t: T) => Promise<void>) {
  const busy = new Map<string, number>();
  const queue = [...items];
  let active = 0;
  await new Promise<void>((resolve) => {
    const pump = () => {
      if (queue.length === 0 && active === 0) return resolve();
      for (let i = 0; i < queue.length && active < CONCURRENCY; ) {
        const h = hostKey(queue[i]);
        if ((busy.get(h) ?? 0) >= PER_HOST) {
          i++;
          continue;
        }
        const [t] = queue.splice(i, 1);
        busy.set(h, (busy.get(h) ?? 0) + 1);
        active++;
        run(t)
          .catch(() => {})
          .finally(() => {
            busy.set(h, (busy.get(h) ?? 1) - 1);
            active--;
            pump();
          });
      }
    };
    pump();
  });
}

export async function runLinkSweep(now = new Date()): Promise<SweepReport> {
  const report: SweepReport = { checked: 0, ok: 0, gone: 0, unsure: 0, archived: [], stoodDown: false, errors: 0 };

  const { data, error } = await supabaseAdmin
    .from("clips")
    .select("id, url, image_url, link_strikes, link_last_strike_at")
    .is("archived_at", null)
    .eq("link_kept", false)
    .order("link_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);
  if (error) throw new Error(`link sweep read failed: ${error.message}`);
  const rows = (data ?? []) as Row[];

  // 1. Ask. Nothing is written until every answer is in, so the stand-down
  //    brake can see the whole run first.
  const answers = new Map<string, { image: LinkResult; page: LinkResult | null }>();
  const deadline = Date.now() + TIME_BUDGET_MS;
  await pool(
    rows,
    (r) => hostOf(r.image_url ?? r.url ?? ""),
    async (r) => {
      // Out of time: leave it unanswered, so it stays first in line tomorrow.
      if (Date.now() > deadline) return;
      const image: LinkResult = r.image_url ? await checkLink(r.image_url) : { verdict: "unsure", detail: "no image" };
      const pageUrl = r.url && r.url !== r.image_url ? r.url : null;
      const page = pageUrl ? await checkLink(pageUrl) : null;
      answers.set(r.id, { image, page });
    }
  );

  const steps = rows
    .filter((r) => answers.has(r.id))
    .map((r) => {
      const a = answers.get(r.id)!;
      const step = nextState(
        { strikes: r.link_strikes ?? 0, lastStrikeAt: r.link_last_strike_at },
        a.image.verdict,
        a.page?.verdict ?? null,
        now
      );
      report.checked++;
      if (step.gone) report.gone++;
      else if (a.image.verdict === "ok" && (!a.page || a.page.verdict === "ok")) report.ok++;
      else report.unsure++;
      return { r, a, step };
    });

  report.stoodDown = report.checked >= 20 && report.gone / report.checked > STAND_DOWN_SHARE;
  if (report.stoodDown) {
    console.warn(`[links] ${report.gone}/${report.checked} gone in one run: standing down, nothing archived or struck`);
  }

  // 2. Write. In a stood-down run only the check time moves, so those clips
  //    go to the back of the queue without gaining strikes.
  let archives = 0;
  for (const { r, step } of steps) {
    const write: Record<string, unknown> = { link_checked_at: now.toISOString() };
    if (!report.stoodDown) {
      write.link_strikes = step.next.strikes;
      write.link_last_strike_at = step.next.lastStrikeAt;
    }
    const { error: e1 } = await supabaseAdmin.from("clips").update(write).eq("id", r.id);
    if (e1) {
      report.errors++;
      continue;
    }
    if (report.stoodDown || !step.archive || archives >= MAX_ARCHIVES_PER_RUN) continue;

    const { data: done, error: e2 } = await supabaseAdmin
      .from("clips")
      .update({ archived_at: now.toISOString(), archived_by_name: null, archived_reason: "link_gone" })
      .eq("id", r.id)
      .is("archived_at", null)
      .select("id");
    if (e2 || !done?.length) {
      if (e2) report.errors++;
      continue;
    }
    archives++;
    report.archived.push(r.id);
    await notify({ kind: "link_gone", actor: null, clipId: r.id });
  }

  if (report.archived.length) {
    for (const p of ["/", "/clip", "/radar", "/genome", "/curators"]) revalidatePath(p);
  }
  return report;
}
