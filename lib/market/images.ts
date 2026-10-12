// Image addresses, before the market reads them. Pure.

/**
 * The API fetches images over HTTPS only. Most hosts serve both, so an
 * http:// address is upgraded; one that can't be is a fact about that
 * image, never a reason to stop the run (it did, 2026-09-28: one BP&O
 * image halted all 22 reads).
 */
export function httpsImage(url: string): string {
  return url.replace(/^http:\/\//i, "https://");
}

/**
 * Jetpack's Photon CDN (i0–i3.wp.com) re-serves a WordPress site's own
 * uploads at `i0.wp.com/<site>/<path>`. Its robots.txt is Automattic's, not
 * the publisher's, and it reserves against AI reading for every site at
 * once — so a publisher whose own robots.txt allows reading (Packaging of
 * the World, 2026-10-12: 64 of 64 items refused, 0 ever read) could never
 * be read through it.
 *
 * Unwrapping gives the publisher's original file on the publisher's own
 * host. Nothing is waived: checkUrl still runs on that address, so the
 * publisher's own robots.txt, AI reservations and tdmrep.json decide.
 * Photon's resize parameters are dropped, since they mean nothing at the
 * origin. Anything that isn't a Photon address passes through untouched.
 */
export function originImage(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!/^i[0-3]\.wp\.com$/i.test(u.hostname)) return url;
  const m = u.pathname.match(/^\/([^/]+\.[^/]+)(\/.+)$/);
  if (!m) return url;
  return `https://${m[1]}${m[2]}`;
}
