import "server-only";
// One pass of the market series. Run daily by Vercel Cron
// (app/api/market/run/route.ts, vercel.json).
//
//   1. Poll every ENABLED source's feed — one request each — after the
//      compliance gate (lib/market/compliance.ts). A source failing the
//      gate is paused with the reason, visible on /radar.
//   2. Keep new items as candidates: link, title, date, image address.
//   3. Read today's allowance (lib/market/plan.ts): a seventh of the week,
//      inside the market's own weekly dollar cap, and never into the $2
//      the clips keep in reserve.
//   4. Pick evenly across sources, re-check each item's page and image
//      host, and classify with the library's classifier — same model,
//      same prompt, same vocabulary, or library-vs-market means nothing.
//   5. Forget candidates nobody read within 21 days.
//
// Nothing here writes clips, clip_tags or anything a library figure reads.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { classifyClip, isUnreadableImageError } from "@/lib/claude/classify-clip";
import { withSpendContext } from "@/lib/claude/spend-context";
import { BUDGET_USD, BudgetExceededError, spentSinceBudgetStart } from "@/lib/claude/spend";
import { checkUrl, headerReservation, marketHeaders } from "./compliance.ts";
import { parseFeed } from "./feeds.ts";
import { sampleArtic, sampleMet, type ArchiveItem } from "./museums.ts";
import {
  ARCHIVE_WEEKLY_ITEMS,
  CLIP_RESERVE_USD_DEFAULT,
  MARKET_WEEKLY_ITEMS,
  MARKET_WEEKLY_USD_DEFAULT,
  dailyAllowance,
  pickEvenly,
  type Candidate,
} from "./plan.ts";

type Source = {
  id: string;
  name: string;
  kind: "rss" | "museum" | "arena";
  series: "market" | "archive";
  feed_url: string;
};

export type RunReport = {
  sources: { id: string; status: string }[];
  allowance: { market: number; archive: number; reason: string };
  classified: number;
  refused: number;
  failed: number;
  stopped: string | null;
};

const PER_FEED = 30;
const CANDIDATE_TTL_DAYS = 21;
const USD_PER_ITEM = 0.05; // ~4.4¢ measured on classify-full, rounded up
const WEEK_AGO = () => new Date(Date.now() - 7 * 86_400_000).toISOString();

const envUsd = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] !== undefined ? n : fallback;
};

async function setSource(id: string, patch: Record<string, unknown>) {
  await supabaseAdmin.from("market_sources").update(patch).eq("id", id);
}

async function pollFeed(s: Source): Promise<string> {
  const gate = await checkUrl(s.feed_url);
  if (!gate.ok) {
    await setSource(s.id, { paused_reason: gate.reason, last_status: "paused", last_polled_at: new Date().toISOString() });
    return `paused: ${gate.reason}`;
  }
  const res = await fetch(s.feed_url, { headers: marketHeaders, signal: AbortSignal.timeout(15000) });
  const reserved = headerReservation(res.headers);
  if (reserved) {
    await setSource(s.id, { paused_reason: reserved, last_status: "paused", last_polled_at: new Date().toISOString() });
    return `paused: ${reserved}`;
  }
  if (!res.ok) {
    await setSource(s.id, { last_status: `feed answered ${res.status}`, last_polled_at: new Date().toISOString() });
    return `feed answered ${res.status}`;
  }
  const items = parseFeed(await res.text(), s.feed_url)
    .filter((i) => i.imageUrl)
    .slice(0, PER_FEED);
  const { data } = await supabaseAdmin
    .from("market_items")
    .upsert(
      items.map((i) => ({
        source_id: s.id,
        url: i.url,
        image_url: i.imageUrl,
        title: i.title,
        published_at: i.publishedAt,
      })),
      { onConflict: "url", ignoreDuplicates: true }
    )
    .select("id");
  const fresh = data?.length ?? 0;
  await setSource(s.id, {
    paused_reason: null,
    last_status: `${items.length} in feed, ${fresh} new`,
    last_polled_at: new Date().toISOString(),
  });
  return `${fresh} new`;
}

async function readCounts(series: "market" | "archive") {
  const { data } = await supabaseAdmin
    .from("market_items")
    .select("source_id, market_sources!inner(series)")
    .eq("status", "classified")
    .eq("market_sources.series", series)
    .gt("classified_at", WEEK_AGO());
  const bySource = new Map<string, number>();
  for (const r of (data ?? []) as { source_id: string }[]) {
    bySource.set(r.source_id, (bySource.get(r.source_id) ?? 0) + 1);
  }
  return { total: data?.length ?? 0, bySource };
}

async function marketUsdLast7Days(): Promise<number | null> {
  const { data, error } = await supabaseAdmin.from("api_spend").select("usd").eq("kind", "market").gt("at", WEEK_AGO());
  if (error) return null;
  return (data ?? []).reduce((n, r) => n + Number((r as { usd: number }).usd), 0);
}

type ReadOutcome = "classified" | "refused" | "failed";

/** Gate, classify, store. Throws only for errors that should stop the run. */
async function readItem(item: { id: string; url: string; image_url: string; title: string | null }): Promise<ReadOutcome> {
  for (const u of [item.url, item.image_url]) {
    const gate = await checkUrl(u);
    if (!gate.ok) {
      await supabaseAdmin.from("market_items").update({ status: "refused", status_note: gate.reason }).eq("id", item.id);
      return "refused";
    }
  }
  try {
    const { classifications } = await withSpendContext({ clipId: null, kind: "market" }, () =>
      classifyClip({ url: item.url, imageUrl: item.image_url, title: item.title, caption: null })
    );
    if (classifications.length > 0) {
      const { error } = await supabaseAdmin.from("market_item_tags").upsert(
        classifications.map((c) => ({ item_id: item.id, tag_id: c.tagId, confidence: c.confidence })),
        { onConflict: "item_id,tag_id", ignoreDuplicates: true }
      );
      if (error) throw new Error(`market_item_tags: ${error.message}`);
    }
    await supabaseAdmin
      .from("market_items")
      .update({ status: "classified", classified_at: new Date().toISOString(), status_note: null })
      .eq("id", item.id);
    return "classified";
  } catch (err) {
    if (isUnreadableImageError(err)) {
      await supabaseAdmin
        .from("market_items")
        .update({ status: "failed", status_note: String(err instanceof Error ? err.message : err).slice(0, 300) })
        .eq("id", item.id);
      return "failed";
    }
    throw err;
  }
}

async function discoverArchive(sources: Source[], n: number): Promise<number> {
  let added = 0;
  for (let i = 0; i < n; i++) {
    const s = sources[i % sources.length];
    let found: ArchiveItem[] = [];
    try {
      const gate = await checkUrl(s.feed_url);
      if (!gate.ok) {
        await setSource(s.id, { paused_reason: gate.reason, last_status: "paused", last_polled_at: new Date().toISOString() });
        continue;
      }
      found = s.id === "artic" ? await sampleArtic(1) : s.id === "met" ? await sampleMet(1) : [];
      await setSource(s.id, { paused_reason: null, last_status: "ok", last_polled_at: new Date().toISOString() });
    } catch (err) {
      await setSource(s.id, { last_status: String(err instanceof Error ? err.message : err).slice(0, 200) });
      continue;
    }
    const { data } = await supabaseAdmin
      .from("market_items")
      .upsert(
        found.map((f) => ({ source_id: s.id, url: f.url, image_url: f.imageUrl, title: f.title })),
        { onConflict: "url", ignoreDuplicates: true }
      )
      .select("id");
    added += data?.length ?? 0;
  }
  return added;
}

export async function runMarket(): Promise<RunReport> {
  const report: RunReport = {
    sources: [],
    allowance: { market: 0, archive: 0, reason: "" },
    classified: 0,
    refused: 0,
    failed: 0,
    stopped: null,
  };

  const { data: srcData, error } = await supabaseAdmin
    .from("market_sources")
    .select("id, name, kind, series, feed_url")
    .eq("enabled", true);
  if (error) throw new Error(`market_sources: ${error.message}`);
  const sources = (srcData ?? []) as Source[];

  // 1–2. Feeds.
  for (const s of sources.filter((x) => x.kind === "rss")) {
    try {
      report.sources.push({ id: s.id, status: await pollFeed(s) });
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err).slice(0, 200);
      await setSource(s.id, { last_status: msg, last_polled_at: new Date().toISOString() });
      report.sources.push({ id: s.id, status: msg });
    }
  }

  // 3. Allowance, per series, out of one shared market budget.
  const spent = await spentSinceBudgetStart();
  const balanceLeftUsd = spent === null ? null : BUDGET_USD - spent;
  const marketUsd = await marketUsdLast7Days();
  const common = {
    marketUsdLast7Days: marketUsd ?? Infinity,
    marketWeeklyUsd: envUsd("MARKET_WEEKLY_USD", MARKET_WEEKLY_USD_DEFAULT),
    balanceLeftUsd,
    clipReserveUsd: envUsd("MARKET_CLIP_RESERVE_USD", CLIP_RESERVE_USD_DEFAULT),
    usdPerItem: USD_PER_ITEM,
  };
  const marketRead = await readCounts("market");
  const archiveRead = await readCounts("archive");
  const market = dailyAllowance({ ...common, weeklyItems: MARKET_WEEKLY_ITEMS - ARCHIVE_WEEKLY_ITEMS, readLast7Days: marketRead.total });
  const archive = dailyAllowance({
    ...common,
    // The archive spends from what the market leaves today.
    marketUsdLast7Days: common.marketUsdLast7Days + market.items * USD_PER_ITEM,
    weeklyItems: ARCHIVE_WEEKLY_ITEMS,
    readLast7Days: archiveRead.total,
  });
  report.allowance = { market: market.items, archive: archive.items, reason: market.reason };

  // 4. Read.
  const { data: candData } = await supabaseAdmin
    .from("market_items")
    .select("id, source_id, discovered_at, published_at, market_sources!inner(series, enabled)")
    .eq("status", "candidate")
    .eq("market_sources.series", "market")
    .eq("market_sources.enabled", true)
    .gt("discovered_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
    .limit(1000);
  const candidates: Candidate[] = ((candData ?? []) as {
    id: string; source_id: string; discovered_at: string; published_at: string | null;
  }[]).map((c) => ({ id: c.id, sourceId: c.source_id, discoveredAt: c.discovered_at, publishedAt: c.published_at }));
  const picked = pickEvenly(candidates, marketRead.bySource, market.items).map((c) => c.id);

  const archiveSources = sources.filter((s) => s.series === "archive");
  if (archive.items > 0 && archiveSources.length > 0) await discoverArchive(archiveSources, archive.items);
  const { data: archiveCands } = await supabaseAdmin
    .from("market_items")
    .select("id, market_sources!inner(series)")
    .eq("status", "candidate")
    .eq("market_sources.series", "archive")
    .order("discovered_at", { ascending: false })
    .limit(archive.items);
  picked.push(...((archiveCands ?? []) as { id: string }[]).map((r) => r.id));

  if (picked.length > 0) {
    const { data: items } = await supabaseAdmin
      .from("market_items")
      .select("id, url, image_url, title")
      .in("id", picked);
    const queue = ((items ?? []) as { id: string; url: string; image_url: string | null; title: string | null }[])
      .filter((i): i is { id: string; url: string; image_url: string; title: string | null } => !!i.image_url);
    // Three at a time: well inside the function's 300 seconds at ~10s a read.
    const worker = async () => {
      while (queue.length > 0 && !report.stopped) {
        const item = queue.shift()!;
        try {
          const outcome = await readItem(item);
          report[outcome]++;
        } catch (err) {
          report.stopped =
            err instanceof BudgetExceededError
              ? "budget ceiling reached"
              : `stopped on an error that is not about one item: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`;
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  // 5. Forget what was never read.
  await supabaseAdmin
    .from("market_items")
    .delete()
    .eq("status", "candidate")
    .lt("discovered_at", new Date(Date.now() - CANDIDATE_TTL_DAYS * 86_400_000).toISOString());

  return report;
}
