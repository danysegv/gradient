// Security headers on every response (security review 2026-10-13, #4).
// Pure, so it is tested (lib/security-headers.test.ts); next.config.ts
// applies it to every route.
//
// What each line is for, in plain terms:
//   - frame-ancestors / X-Frame-Options: no other site can show 04AM
//     inside a frame, so nobody can lay an invisible sign-in or "delete"
//     button under a decoy (clickjacking).
//   - script-src 'self': only scripts from 04AM itself run. Next's own
//     page bootstrap is inline, hence 'unsafe-inline'; what this closes is
//     loading a script from anywhere else, which is how most injected
//     code arrives. (Nonces would close inline too, but force every page,
//     including /privacy and /rights, to render on each request.)
//   - img-src https: — clips are hotlinked from their rights holders'
//     own servers (04AM links, it does not host), so any https image is
//     allowed. data:/blob: cover generated previews.
//   - connect-src: the browser only ever talks to 04AM and to Supabase
//     (session refresh in components/session-keeper.tsx).
//   - object-src 'none', base-uri 'self', form-action 'self': no plugins,
//     no <base> hijack, and forms can only post back to 04AM.
//   - frame-src allows extension pages: the 04AM Clipper draws its panel
//     in an iframe, and Firefox applies the page's policy to it.

export type Header = { key: string; value: string };

export function contentSecurityPolicy(opts: { supabaseUrl?: string; dev?: boolean }): string {
  const supabase = opts.supabaseUrl ? new URL(opts.supabaseUrl).origin : "";
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // React's development build needs eval for its error overlay.
    ["script-src", ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "https:", "data:", "blob:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...(supabase ? [supabase] : []), ...(opts.dev ? ["ws:"] : [])]],
    ["media-src", ["'self'", "https:"]],
    ["frame-src", ["'self'", "chrome-extension:", "moz-extension:", "safari-web-extension:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!opts.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: { supabaseUrl?: string; dev?: boolean }): Header[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(opts) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // The browser default, stated: hotlinked hosts see our origin, never
    // the page path or search (their hotlink checks only need the origin).
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // Browsers that have seen 04AM once never use plain http for it again,
    // for two years, subdomains included (Vercel already redirects http to
    // https; this stops the first request being sent unencrypted at all).
    ...(opts.dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
