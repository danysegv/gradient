import { checkCron } from "@/lib/cron-auth";
import { runLinkSweep } from "@/lib/clips/link-sweep";

// The daily link check, called by Vercel Cron (vercel.json). Only the cron
// secret may run it (lib/cron-auth.ts): it archives clips.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cron = checkCron(request);
  if (!cron.ok) return Response.json({ error: cron.error }, { status: cron.status });
  const report = await runLinkSweep();
  console.info(`[links] ${JSON.stringify(report)}`);
  return Response.json(report);
}
