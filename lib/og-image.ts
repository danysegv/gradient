import "server-only";

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
    const res = await fetch(pageUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; 04AMClipper/1.0)",
      },
    });
    if (!res.ok) return null;

    const html = await res.text();
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
