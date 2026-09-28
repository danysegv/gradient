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
  MARKET_WEEKLY_USD_DEFAULT,
  dailyAllowance,
  matchAllowance,
  isRecent,
  MARKET_MAX_AGE_DAYS,
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
  /** How many items were actually queued, and any query that failed. */
  picked: number;
  errors: string[];
  /** The library's size against the market's, after polling. */
  level?: { library: number; market: number; waiting: number };
  classified: number;
  refused: number;
  failed: number;
  stopped: string | null;
};

const PER_FEED = 30;
const CANDIDATE_TTL_DAYS = 21;
// Measured on the first market reads: ~1.8¢ an item (the taxonomy prompt
// is cached). Budgeted at 3¢ so the caps stop short, never past.
const USD_PER_ITEM = 0.03;
const WEEK_AGO = () => new Date(Date.now() - 7 * 86_400_000).toISOString();

const envUsd = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] !== undefined ? n : fallback;
};

async function setSource(id: string, patch: Record<string, unknown>) {
  await supabaseAdmin.from("market_sources").update(patch).eq("id", id);
}

const MAX_BACKFILL_PAGES = 8;

/** Page n of a feed. WordPress reads `paged`; a feed that ignores it repeats page 1, which stops the walk. */
function feedPage(feedUrl: string, n: number): string {
  if (n === 1) return feedUrl;
  const u = new URL(feedUrl);
  u.searchParams.set("paged", String(n));
  return u.toString();
}

/**
 * One source's feed. Page 1 always; older pages only while the market is
 * short of the library's size, only back to the 90-day line, and never for
 * a source whose robots.txt asks for a crawl delay of 30s or more.
 */
async function pollFeed(s: Source, backfill: boolean): Promise<string> {
  const gate = await checkUrl(s.feed_url);
  if (!gate.ok) {
    await setSource(s.id, { paused_reason: gate.reason, last_status: "paused", last_polled_at: new Date().toISOString() });
    return `paused: ${gate.reason}`;
  }
  const maxPages = backfill && (gate.crawlDelay ?? 0) < 30 ? MAX_BACKFILL_PAGES : 1;
  const now = Date.now();
  const seen = new Set<string>();
  let recent = 0;
  let fresh = 0;
  let tooOld = 0;
  let pages = 0;
  let firstStatus: string | null = null;
  for (let n = 1; n <= maxPages; n++) {
    const url = feedPage(s.feed_url, n);
    if (n > 1 && !(await checkUrl(url)).ok) break;
    const res = await fetch(url, { headers: marketHeaders, signal: AbortSignal.timeout(15000) });
    const reserved = headerReservation(res.headers);
    if (reserved) {
      await setSource(s.id, { paused_reason: reserved, last_status: "paused", last_polled_at: new Date().toISOString() });
      return `paused: ${reserved}`;
    }
    if (!res.ok) {
      if (n === 1) firstStatus = `feed answered ${res.status}`;
      break;
    }
    const parsed = parseFeed(await res.text(), s.feed_url).filter((i) => i.imageUrl);
    const unseen = parsed.filter((i) => !seen.has(i.url));
    if (unseen.length === 0) break; // the feed ignores paging, or has run out
    unseen.forEach((i) => seen.add(i.url));
    pages = n;
    // Only what was published in the last three months, by the feed's own date.
    const items = unseen.filter((i) => isRecent(i.publishedAt, now)).slice(0, PER_FEED);
    tooOld += unseen.length - items.length;
    recent += items.length;
    if (items.length > 0) {
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
      fresh += data?.length ?? 0;
    }
    // Past the 90-day line: older pages can only be older.
    if (items.length < unseen.length) break;
  }
  if (firstStatus) {
    await setSource(s.id, { last_status: firstStatus, last_polled_at: new Date().toISOString() });
    return firstStatus;
  }
  await setSource(s.id, {
    paused_reason: null,
    last_status: `${recent} recent across ${pages} page${pages === 1 ? "" : "s"}, ${fresh} new${tooOld ? `, ${tooOld} older or undated left out` : ""}`,
    last_polled_at: new Date().toISOString(),
  });
  return `${fresh} new`;
}

/**
 * Where the market stands against the library: the library's size (active
 * clips), the market's (recent articles read, by publication date, per
 * source) and what is already waiting to be read.
 */
async function marketLevel() {
  const since = new Date(Date.now() - MARKET_MAX_AGE_DAYS * 86_400_000).toISOString();
  const lib = await supabaseAdmin
    .from("clips")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null);
  const have = await supabaseAdmin
    .from("market_items")
    .select("source_id, market_sources!inner(series)")
    .eq("status", "classified")
    .eq("market_sources.series", "market")
    .gt("published_at", since);
  const waiting = await supabaseAdmin
    .from("market_items")
    .select("id, market_sources!inner(series, enabled)", { count: "exact", head: true })
    .eq("status", "candidate")
    .eq("market_sources.series", "market")
    .eq("market_sources.enabled", true)
    .gt("published_at", since);
  const errors = [lib.error, have.error, waiting.error].filter(Boolean).map((e) => e!.message);
  const bySource = new Map<string, number>();
  for (const r of (have.data ?? []) as { source_id: string }[]) {
    bySource.set(r.source_id, (bySource.get(r.source_id) ?? 0) + 1);
  }
  return {
    librarySize: lib.count ?? 0,
    marketHave: have.data?.length ?? 0,
    waiting: waiting.count ?? 0,
    bySource,
    errors,
  };
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

/**
 * The API fetches images over HTTPS only. Most hosts serve both, so an
 * http:// address is upgraded; one that can't be is a fact about that
 * image, never a reason to stop the run (it did, 2026-09-28: one BP&O
 * image halted all 22 reads).
 */
export function httpsImage(url: string): string {
  return url.replace(/^http:\/\//i, "https://");
}

/** Failures that belong to one item: park it and read the next. */
export function isItemError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return isUnreadableImageError(err) || /only https urls are supported/i.test(m) || /invalid.*url/i.test(m);
}

/** Gate, classify, store. Throws only for errors that should stop the run. */
async function readItem(raw: { id: string; url: string; image_url: string; title: string | null }): Promise<ReadOutcome> {
  const item = { ...raw, image_url: httpsImage(raw.image_url) };
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
    if (isItemError(err)) {
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
    picked: 0,
    errors: [],
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

  // 1–2. Feeds. Older pages only while the market is short of the library.
  const before = await marketLevel();
  report.errors.push(...before.errors);
  const backfill = before.librarySize - before.marketHave > before.waiting;
  for (const s of sources.filter((x) => x.kind === "rss")) {
    try {
      report.sources.push({ id: s.id, status: await pollFeed(s, backfill) });
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
  const level = await marketLevel();
  const archiveRead = await readCounts("archive");
  const market = matchAllowance({ ...common, librarySize: level.librarySize, marketHave: level.marketHave });
  report.level = { library: level.librarySize, market: level.marketHave, waiting: level.waiting };
  const archive = dailyAllowance({
    ...common,
    // The archive spends from what the market leaves today.
    marketUsdLast7Days: common.marketUsdLast7Days + market.items * USD_PER_ITEM,
    weeklyItems: ARCHIVE_WEEKLY_ITEMS,
    readLast7Days: archiveRead.total,
  });
  report.allowance = { market: market.items, archive: archive.items, reason: market.reason };

  // 4. Read.
  const { data: candData, error: candErr } = await supabaseAdmin
    .from("market_items")
    .select("id, source_id, discovered_at, published_at, market_sources!inner(series, enabled)")
    .eq("status", "candidate")
    .eq("market_sources.series", "market")
    .eq("market_sources.enabled", true)
    .gt("discovered_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
    // Re-checked at read time: a candidate found at 85 days old is past
    // the line a week later.
    .gt("published_at", new Date(Date.now() - MARKET_MAX_AGE_DAYS * 86_400_000).toISOString())
    .limit(1000);
  if (candErr) report.errors.push(`candidates: ${candErr.message}`);
  const candidates: Candidate[] = ((candData ?? []) as {
    id: string; source_id: string; discovered_at: string; published_at: string | null;
  }[]).map((c) => ({ id: c.id, sourceId: c.source_id, discoveredAt: c.discovered_at, publishedAt: c.published_at }));
  const picked = pickEvenly(candidates, level.bySource, market.items).map((c) => c.id);

  const archiveSources = sources.filter((s) => s.series === "archive");
  if (archive.items > 0 && archiveSources.length > 0) await discoverArchive(archiveSources, archive.items);
  const { data: archiveCands, error: archErr } = await supabaseAdmin
    .from("market_items")
    .select("id, market_sources!inner(series)")
    .eq("status", "candidate")
    .eq("market_sources.series", "archive")
    .order("discovered_at", { ascending: false })
    .limit(archive.items);
  if (archErr) report.errors.push(`archive candidates: ${archErr.message}`);
  picked.push(...((archiveCands ?? []) as { id: string }[]).map((r) => r.id));

  report.picked = picked.length;
  if (picked.length > 0) {
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("market_items")
      .select("id, url, image_url, title")
      .in("id", picked);
    if (itemsErr) report.errors.push(`items: ${itemsErr.message}`);
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
