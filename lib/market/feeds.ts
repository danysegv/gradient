// RSS 2.0 and Atom, read for the market series. Pure; no dependency.
//
// A feed is what a publication offers for syndication, so it is the
// politest door there is: one request per source per run, no crawling of
// article pages. Out of each item we keep only facts — link, title, date —
// and the address of its lead image, which the classifier is pointed at
// once and which no page ever shows.

export type FeedItem = {
  url: string;
  title: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  "#8217": "’", "#8216": "‘", "#8220": "“", "#8221": "”", "#8211": "–", "#8212": "—",
};

export function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (ENTITIES[k]) return ENTITIES[k];
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10));
      return m;
    });
}

const block = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => m[1]);

function text(xml: string, ...tags: string[]): string | null {
  for (const t of tags) {
    const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "i"));
    if (m) {
      const v = decode(m[1]).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (v) return v;
    }
  }
  return null;
}

const attr = (tagSrc: string, name: string) => {
  const m = tagSrc.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return m ? decode(m[1]) : null;
};

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;

function imageOf(item: string): string | null {
  // media:content / media:thumbnail — an image by medium, type or extension.
  for (const m of item.matchAll(/<media:(content|thumbnail)\b[^>]*>/gi)) {
    const url = attr(m[0], "url");
    if (!url) continue;
    const medium = attr(m[0], "medium");
    const type = attr(m[0], "type");
    if (m[1].toLowerCase() === "thumbnail" || medium === "image" || type?.startsWith("image/") || IMAGE_EXT.test(url)) {
      return url;
    }
  }
  for (const m of item.matchAll(/<enclosure\b[^>]*>/gi)) {
    const url = attr(m[0], "url");
    const type = attr(m[0], "type");
    if (url && (type?.startsWith("image/") || IMAGE_EXT.test(url))) return url;
  }
  // The first picture in the body. Decoded first: most feeds escape it.
  for (const body of [
    ...block(item, "content:encoded"),
    ...block(item, "description"),
    ...block(item, "content"),
    ...block(item, "summary"),
  ]) {
    const html = decode(body);
    const img = html.match(/<img\b[^>]*>/i);
    if (img) {
      const src = attr(img[0], "src") ?? attr(img[0], "data-src");
      if (src && !src.startsWith("data:")) return src;
    }
  }
  return null;
}

function linkOf(item: string, atom: boolean): string | null {
  if (atom) {
    const links = [...item.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    const alt = links.find((l) => !/rel\s*=/i.test(l) || /rel\s*=\s*["']alternate["']/i.test(l));
    return alt ? attr(alt, "href") : null;
  }
  return text(item, "link") ?? text(item, "guid");
}

function iso(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function absolute(u: string | null, base: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseFeed(xml: string, feedUrl: string): FeedItem[] {
  const atom = !/<rss\b|<rdf:RDF\b/i.test(xml) && /<feed\b/i.test(xml);
  const items = atom ? block(xml, "entry") : block(xml, "item");
  const out: FeedItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const url = absolute(linkOf(it, atom), feedUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: text(it, "title"),
      publishedAt: iso(text(it, "pubDate", "published", "updated", "dc:date")),
      // Stored as HTTPS: the classifier's fetch accepts nothing else.
      imageUrl: absolute(imageOf(it), url)?.replace(/^http:\/\//i, "https://") ?? null,
    });
  }
  return out;
}
