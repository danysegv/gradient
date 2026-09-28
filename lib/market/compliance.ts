// The market's legal gate, applied by the runner on every pass — not once
// at review time. A source reviewed as fine on 28 September that adds an
// AI block on 3 October is paused on 3 October, and says why.
//
// Three machine-readable signals, all honoured, any one enough to stop:
//   1. robots.txt   — our agent and Anthropic's fetchers must be allowed
//                     the path, and no AI agent may be barred site-wide.
//   2. TDMRep       — /.well-known/tdmrep.json (W3C TDM Reservation
//                     Protocol), and the `tdm-reservation` header.
//   3. X-Robots-Tag — `noai` / `noimageai` on the feed response.
// Terms of use can't be read by a machine; those are the human review in
// market_sources.review_note, and a source is off until that review says on.
//
// robots.txt errors follow RFC 9309: a 4xx means no rules (allowed), a 5xx
// or a network failure means "assume disallowed" — so a site that is down
// is never read by accident.

import { aiReservations, parseRobots, readableBy, crawlDelay, MARKET_USER_AGENT, MARKET_USER_AGENT_TOKEN, type Robots } from "./robots.ts";

export type Verdict = { ok: true; crawlDelay: number | null } | { ok: false; reason: string };

export type TdmRule = { location: string; reserved: boolean };

export function parseTdmRep(json: unknown): TdmRule[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      location: typeof r.location === "string" ? r.location : "",
      reserved: Number(r["tdm-reservation"]) === 1,
    }))
    .filter((r) => r.location !== "");
}

/** The most specific TDMRep rule covering `path` decides. */
export function tdmReserved(rules: TdmRule[], path: string): boolean {
  let best: TdmRule | null = null;
  for (const r of rules) {
    const re = new RegExp(
      "^" + r.location.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (r.location.endsWith("*") ? "" : "$")
    );
    if (re.test(path) && (!best || r.location.length > best.location.length)) best = r;
  }
  return best?.reserved ?? false;
}

/** What a response's own headers say about being mined. */
export function headerReservation(headers: Headers): string | null {
  if (headers.get("tdm-reservation")?.trim() === "1") return "tdm-reservation header";
  const xr = (headers.get("x-robots-tag") ?? "").toLowerCase();
  if (/\bnoai\b/.test(xr)) return "X-Robots-Tag: noai";
  if (/\bnoimageai\b/.test(xr)) return "X-Robots-Tag: noimageai";
  return null;
}

// ---------------------------------------------------------------------
// Network. Cached per origin for one run: the runner is short-lived.

type RobotsRead = { robots: Robots } | { unavailable: string };
const robotsCache = new Map<string, Promise<RobotsRead>>();
const tdmCache = new Map<string, Promise<TdmRule[]>>();

export const marketHeaders = { "user-agent": MARKET_USER_AGENT };

function robotsOf(origin: string): Promise<RobotsRead> {
  let p = robotsCache.get(origin);
  if (!p) {
    p = (async (): Promise<RobotsRead> => {
      try {
        const res = await fetch(`${origin}/robots.txt`, { headers: marketHeaders, signal: AbortSignal.timeout(8000) });
        if (res.ok) return { robots: parseRobots(await res.text()) };
        if (res.status >= 400 && res.status < 500) return { robots: parseRobots("") };
        return { unavailable: `robots.txt answered ${res.status}` };
      } catch (err) {
        return { unavailable: `robots.txt unreachable (${err instanceof Error ? err.message : String(err)})` };
      }
    })();
    robotsCache.set(origin, p);
  }
  return p;
}

function tdmOf(origin: string): Promise<TdmRule[]> {
  let p = tdmCache.get(origin);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`${origin}/.well-known/tdmrep.json`, { headers: marketHeaders, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        return parseTdmRep(await res.json());
      } catch {
        return [];
      }
    })();
    tdmCache.set(origin, p);
  }
  return p;
}

/** May the market read this URL at all? Used for feeds, pages and image hosts. */
export async function checkUrl(url: string): Promise<Verdict> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: "not a URL" };
  }
  const read = await robotsOf(u.origin);
  if ("unavailable" in read) return { ok: false, reason: read.unavailable };
  const reserved = aiReservations(read.robots);
  if (reserved.length > 0) {
    return { ok: false, reason: `${u.host} reserves against AI reading in robots.txt (${reserved.join(", ")})` };
  }
  const path = u.pathname + u.search;
  const readable = readableBy(read.robots, path);
  if (!readable.ok) return { ok: false, reason: `robots.txt disallows ${readable.blocked.join(", ")} on ${u.host}${u.pathname}` };
  if (tdmReserved(await tdmOf(u.origin), u.pathname)) {
    return { ok: false, reason: `${u.host} reserves TDM rights (tdmrep.json)` };
  }
  return { ok: true, crawlDelay: crawlDelay(read.robots, MARKET_USER_AGENT_TOKEN) };
}

/** For tests: forget what this run has read. */
export function resetComplianceCache() {
  robotsCache.clear();
  tdmCache.clear();
}
