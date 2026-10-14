import "server-only";
import { readTextLimited, safeFetch } from "./net/safe-fetch.ts";

// A page is read only for its og:image tag, which sits in <head>: the first
// 2 MB is plenty, and a huge or endless page can't tie the function up.
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

function matchMetaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i"
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Best-effort — returns null on any failure so the caller can save the clip
// unclassified rather than block on a flaky external fetch.
export async function fetchOgImage(pageUrl: string): Promise<string | null> {
  try {
    // Public addresses only, at every redirect (security review #6).
    const res = await safeFetch(pageUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; 04AMClipper/1.0)",
      },
    });
    if (!res.ok) return null;

    const html = await readTextLimited(res, MAX_PAGE_BYTES);
    const found =
      matchMetaContent(html, "og:image") ??
      matchMetaContent(html, "twitter:image");
    if (!found) return null;

    try {
      return new URL(found, pageUrl).toString();
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}
