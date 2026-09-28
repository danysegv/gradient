import { checkCron } from "@/lib/cron-auth";
import { runMarket } from "@/lib/market/run";

// The market series' daily pass, called by Vercel Cron (vercel.json).
// It spends money, so it runs only for the cron secret (lib/cron-auth.ts).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cron = checkCron(request);
  if (!cron.ok) return Response.json({ error: cron.error }, { status: cron.status });
  const report = await runMarket();
  console.info(`[market] ${JSON.stringify(report)}`);
  return Response.json(report);
}
