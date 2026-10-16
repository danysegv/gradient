// Is a clip's link still there? (Daniela, 2026-10-16)
//
// A clip that points at nothing breaks the promise that every piece is
// sourced, so a daily sweep (lib/clips/link-sweep.ts) checks each clip's
// image and source page, and archives the clip once either is GONE. It then
// tells the curator who clipped it.
//
// "Gone" is narrow on purpose. Only three answers count:
//   - 404 Not Found, 410 Gone: the server says the thing isn't there;
//   - the domain no longer exists at all (DNS NXDOMAIN).
// Everything else is "unsure" and never counts: 401/403 (sites that block
// bots or hotlinks), 429 (rate limits), 5xx (a bad day), timeouts, TLS
// errors, refused connections. Many healthy sites answer a script with 403,
// and archiving those would take good clips down.
//
// And one "gone" is never enough: a clip is archived only after
// STRIKES_TO_ARCHIVE gone checks on different days in a row. An "ok" answer
// clears the strikes; an "unsure" one leaves them as they were.
//
// This module is pure except checkLink, which goes through safeFetch (the
// SSRF guard, security review #6) like every fetch to an address someone
// else chose.

import { safeFetch } from "../net/safe-fetch.ts";

export type LinkVerdict = "ok" | "gone" | "unsure";

export type LinkResult = { verdict: LinkVerdict; detail: string };

export const STRIKES_TO_ARCHIVE = 3;
/** Strikes must be at least this far apart, so three means three days. */
export const STRIKE_GAP_HOURS = 20;
export const LINK_CHECK_TIMEOUT_MS = 10_000;

export const LINK_CHECK_USER_AGENT =
  "04AM-LinkCheck/1.0 (+https://gradient-flax.vercel.app/rights; checks that clipped links still exist)";

/** The verdict for an HTTP status, after redirects were followed. */
export function verdictForStatus(status: number): LinkVerdict {
  if (status === 404 || status === 410) return "gone";
  if (status >= 200 && status < 400) return "ok";
  return "unsure";
}

/** The verdict for a failed request: only a domain that doesn't exist counts. */
export function verdictForError(err: unknown): LinkResult {
  const code = errorCode(err);
  if (code === "ENOTFOUND") return { verdict: "gone", detail: "domain no longer exists" };
  return { verdict: "unsure", detail: code ?? (err instanceof Error ? err.name : "error") };
}

function errorCode(err: unknown): string | null {
  for (let e: unknown = err, i = 0; e && i < 4; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/** One request, body discarded. GET, because many servers answer HEAD wrongly. */
export async function checkLink(url: string): Promise<LinkResult> {
  try {
    const res = await safeFetch(url, {
      method: "GET",
      headers: { "user-agent": LINK_CHECK_USER_AGENT, accept: "*/*", range: "bytes=0-0" },
      signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => {});
    return { verdict: verdictForStatus(res.status), detail: String(res.status) };
  } catch (err) {
    return verdictForError(err);
  }
}

export type LinkState = { strikes: number; lastStrikeAt: string | null };

export type Step = {
  next: LinkState;
  archive: boolean;
  /** What is gone, for the curator's notification. */
  gone: "image" | "page" | "both" | null;
};

/**
 * The next state after checking a clip's image and page. `page` is null
 * when the clip has no separate page link.
 */
export function nextState(
  prev: LinkState,
  image: LinkVerdict,
  page: LinkVerdict | null,
  now: Date
): Step {
  const imageGone = image === "gone";
  const pageGone = page === "gone";
  const gone = imageGone && pageGone ? "both" : imageGone ? "image" : pageGone ? "page" : null;

  if (gone) {
    const last = prev.lastStrikeAt ? new Date(prev.lastStrikeAt).getTime() : null;
    const spaced = last === null || now.getTime() - last >= STRIKE_GAP_HOURS * 3600_000;
    const next = spaced ? { strikes: prev.strikes + 1, lastStrikeAt: now.toISOString() } : prev;
    return { next, archive: next.strikes >= STRIKES_TO_ARCHIVE, gone };
  }
  // Both answered and neither is gone: a clean bill clears the strikes. An
  // unsure answer on either side proves nothing, so the strikes stand.
  const clean = image === "ok" && (page === null || page === "ok");
  return { next: clean ? { strikes: 0, lastStrikeAt: null } : prev, archive: false, gone: null };
}
