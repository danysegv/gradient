// Where emailed links point (confirm sign-up, reset password) — security
// review 2026-10-13, #10. Pure, so it is tested.
//
// Before, the address came from the request's own Host header. On Vercel
// that can't be forged, and Supabase only redirects to its allow-list, so
// it was safe — but it leaned on both. In production the address is now
// fixed and never read from the request:
//
//   1. NEXT_PUBLIC_SITE_URL, when set (set it the day 04AM has its own
//      domain, and add that domain to Supabase → Auth → URL Configuration);
//   2. on Vercel production, the project's production address, which
//      Vercel provides as VERCEL_PROJECT_PRODUCTION_URL;
//   3. otherwise (local dev, previews), the request's own host.

type Env = Record<string, string | undefined>;

export function siteOrigin(
  env: Env,
  request: { host: string | null; proto: string | null }
): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return new URL(explicit).origin;
  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (env.VERCEL_ENV === "production" && production) return `https://${production}`;
  const host = request.host ?? "localhost:3000";
  const proto = request.proto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
