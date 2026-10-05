// The cookie notice: one line, shown once, no Accept/Reject.
//
// Why there is nothing to accept (Daniela, 2026-10-05): every cookie 04AM
// sets is strictly necessary or remembers a choice the visitor made — the
// sign-in session, having entered the intro, the hidden clipper card, and
// this notice's own dismissal. There is no analytics, advertising or
// third-party script anywhere (see app/privacy/page.tsx). A consent banner
// would offer a refusal that changes nothing. This is a notice, not a
// gate: nothing waits on it.
//
// If a tracking or analytics script is ever added, this stops being
// enough — that script needs real, prior, refusable consent, and the
// notice has to become a choice. lib/cookie-notice.test.ts checks the
// layout for the usual analytics packages so that can't happen quietly.

export const NOTICE_COOKIE = "04am_cookie_notice";
const ENTERED_COOKIE = "04am_entered"; // mirrors lib/intro.ts; checked in the test

/** One year. A preference record, so it may outlive the session. */
export const NOTICE_MAX_AGE = 60 * 60 * 24 * 365;

function hasCookie(cookieHeader: string, name: string): boolean {
  return cookieHeader.split(/;\s*/).some((pair) => pair.split("=")[0] === name);
}

/**
 * Whether to show the notice. Never over the intro: on `/` the intro is
 * what a visitor sees until they've entered, or whenever ?intro replays
 * it — and a shared search link (?q= / ?color=) skips the intro, so the
 * notice shows there as on any other page.
 */
export function shouldShowNotice(cookieHeader: string, pathname: string, search: string): boolean {
  if (hasCookie(cookieHeader, NOTICE_COOKIE)) return false;
  if (pathname !== "/") return true;
  const params = new URLSearchParams(search);
  if (params.has("q") || params.has("color")) return true;
  if (params.has("intro")) return false;
  return hasCookie(cookieHeader, ENTERED_COOKIE);
}

export function noticeCookie(secure: boolean): string {
  return `${NOTICE_COOKIE}=1; Path=/; Max-Age=${NOTICE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
