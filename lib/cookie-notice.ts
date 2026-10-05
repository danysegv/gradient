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
// notice has to become a choice. lib/cookie-notice.test.ts checks
// package.json for the usual analytics packages so that can't happen quietly.
//
// Never over the intro — and that is read from the page, not guessed from
// cookies: the intro's root carries `data-intro` (components/intro/intro.tsx).
// The first version inferred it from 04am_entered, which is httpOnly, so the
// browser never saw it and the notice never showed on `/` (fixed 2026-10-05).

export const NOTICE_COOKIE = "04am_cookie_notice";
export const INTRO_SELECTOR = "[data-intro]";

/** One year. A preference record, so it may outlive the session. */
export const NOTICE_MAX_AGE = 60 * 60 * 24 * 365;

function hasCookie(cookieHeader: string, name: string): boolean {
  return cookieHeader.split(/;\s*/).some((pair) => pair.split("=")[0] === name);
}

export function shouldShowNotice(cookieHeader: string, introOnScreen: boolean): boolean {
  return !introOnScreen && !hasCookie(cookieHeader, NOTICE_COOKIE);
}

export function noticeCookie(secure: boolean): string {
  return `${NOTICE_COOKIE}=1; Path=/; Max-Age=${NOTICE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
