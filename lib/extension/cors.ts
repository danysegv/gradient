// CORS for the browser extension's endpoints (app/api/extension/*).
//
// An extension with host permission for this site can usually fetch it
// without CORS at all, but browsers disagree at the edges (Safari most of
// all), so the endpoints answer extension origins explicitly. Web pages
// get no Access-Control-Allow-Origin, so a site can't read these
// responses — and nothing here is ambient anyway: every call carries its
// own bearer token, never a cookie.
//
// Pure, so it is tested.

const EXTENSION_ORIGIN =
  /^(chrome-extension|moz-extension|safari-web-extension|ms-browser-extension|extension):\/\/[A-Za-z0-9._-]{1,128}$/;

export function isExtensionOrigin(origin: string | null): origin is string {
  return !!origin && EXTENSION_ORIGIN.test(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = { Vary: "Origin", "Cache-Control": "no-store" };
  if (!isExtensionOrigin(origin)) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "600",
  };
}

export function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request.headers.get("origin")) });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

/** Reads a JSON object body, or null for anything else (or anything huge). */
export async function readJsonObject(request: Request, maxBytes = 64_000): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > maxBytes) return null;
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * A call made by the extension's script on a 04AM page itself (extension/
 * site.js), which rides on the site's cookies. Both marks are required:
 * the browser's own Sec-Fetch-Site (a page can't forge it) or a matching
 * Origin, and a custom header no cross-site form can send.
 */
export function isSiteBridgeCall(request: Request): boolean {
  if (request.headers.get("x-04am-clipper") !== "1") return false;
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
