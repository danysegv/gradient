/**
 * Fetching a clip's image ourselves, for the classifier — and, since
 * 2026-09-25, once at the door (lib/clips/create.ts), to refuse a clip
 * whose image can't be read before it is saved. Either way the bytes are
 * dropped as soon as the call returns.
 *
 * Normally we hand Anthropic the image URL and their servers fetch it —
 * 04AM never touches the bytes, which is the assumption the whole rights
 * posture rests on. Some hosts refuse that fetch: the request carries no
 * referer and doesn't look like someone reading their page, so hotlink
 * protection turns it away and the clip parks with no tags at all.
 *
 * This is the fallback for exactly that case. We ask for the image the
 * way a browser on the clip's own page would, hand the bytes to the same
 * classifier in the same call, and drop them when the request ends.
 * Nothing is written to disk, to Supabase or to storage; the site still
 * hotlinks the original everywhere it shows a clip.
 *
 * A host that says no in robots.txt is left alone. That is a site asking
 * not to be read by machines, and working around it with a friendlier
 * user-agent would be the opposite of how 04AM treats everything else.
 */

/** The biggest file worth pulling; beyond this the clip parks as before. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Longest edge sent to the model. Past this the extra pixels buy nothing. */
export const MAX_IMAGE_EDGE = 1568;

/** The API's cap on one image; raw bytes above it can't go without sharp. */
const MAX_RAW_BYTES = 5 * 1024 * 1024;

/** What the model accepts as-is. Everything else we re-encode first. */
const SUPPORTED = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type SupportedMediaType = (typeof SUPPORTED)[number];

export const CLASSIFIER_USER_AGENT =
  "Mozilla/5.0 (compatible; 04AM/1.0; +https://gradient-flax.vercel.app)";

/**
 * Anthropic could not GET the file — a dead CDN, an expired signed URL,
 * or (the case this exists for) a host refusing an unreferred fetch.
 * Deliberately narrower than isUnreadableImageError: "could not process
 * image" means the bytes arrived and were unreadable, and fetching the
 * same unreadable bytes ourselves would achieve nothing.
 */
export function isDownloadRefusal(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (/robots\.txt/i.test(message)) return false;
  return /unable to download the file/i.test(message);
}

/** Anything the host calls an image is worth handing to sharp. */
export function isImageContentType(contentType: string | null): boolean {
  return (contentType ?? "").trim().toLowerCase().startsWith("image/");
}

export function mediaTypeOf(contentType: string | null): SupportedMediaType | null {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const found = SUPPORTED.find((t) => t === type);
  if (found) return found;
  // A few CDNs serve JPEGs as image/jpg.
  if (type === "image/jpg") return "image/jpeg";
  return null;
}

/**
 * Minimal robots.txt: the rules for `*` (we never claim another agent's
 * name), longest match wins, Allow beats Disallow at equal length —
 * the behaviour every major crawler agrees on. An empty Disallow means
 * "allow everything", which is the one rule people get wrong by hand.
 */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  let inStar = false;
  let best: { length: number; allow: boolean } | null = null;
  for (const raw of robotsTxt.split("\n")) {
    const line = raw.split("#")[0].trim();
    if (line === "") continue;
    const [field, ...rest] = line.split(":");
    const key = field.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      inStar = value === "*";
      continue;
    }
    if (!inStar) continue;
    if (key !== "allow" && key !== "disallow") continue;
    if (key === "disallow" && value === "") continue; // disallow nothing
    if (value === "" || !path.startsWith(value)) continue;
    if (best === null || value.length > best.length ||
        (value.length === best.length && key === "allow")) {
      best = { length: value.length, allow: key === "allow" };
    }
  }
  return best === null ? true : best.allow;
}

const robotsCache = new Map<string, Promise<string | null>>();

async function robotsFor(origin: string): Promise<string | null> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { "user-agent": CLASSIFIER_USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });
      // No robots.txt is not a refusal; an error page isn't either.
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  })();
  robotsCache.set(origin, pending);
  return pending;
}

export type FetchedImage = { data: string; mediaType: SupportedMediaType };

/**
 * What the fallback did, in one line, so a clip that parks says why.
 * Vercel logs are not where this belongs: the reason a clip is parked is
 * a fact about the clip, and it lives with the clip.
 */
export type FallbackResult =
  | { image: FetchedImage; note: string }
  | { image: null; note: string };

/**
 * The image as bytes, or null with the reason logged. Null always means
 * "carry on and let the clip park as it would have" — this path may
 * never turn a classification failure into a thrown error.
 */
export async function fetchImageForClassifier(
  imageUrl: string,
  pageUrl: string
): Promise<FallbackResult> {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return { image: null, note: "not a URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { image: null, note: `protocol ${parsed.protocol}` };
  }

  const robots = await robotsFor(parsed.origin);
  if (robots !== null && !robotsAllows(robots, parsed.pathname)) {
    return { image: null, note: "robots.txt disallows this path" };
  }

  try {
    const res = await fetch(imageUrl, {
      // What a browser on the clip's own page would send. The referer is
      // the part that matters: hotlink protection is checking whether
      // this request belongs to a page view of theirs.
      headers: {
        "user-agent": CLASSIFIER_USER_AGENT,
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer: pageUrl,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { image: null, note: `host answered ${res.status}` };
    const contentType = res.headers.get("content-type");
    if (!isImageContentType(contentType)) {
      return { image: null, note: `host served ${contentType ?? "no type"}` };
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_IMAGE_BYTES) {
      return { image: null, note: `${declared} bytes, over the limit` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      return { image: null, note: `${buf.byteLength} bytes, over the limit` };
    }
    return await asJpeg(buf, contentType);
  } catch (err) {
    return {
      image: null,
      note: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Re-encode to JPEG, always. What a host serves is not always what the
 * model takes — the first clip through this path was a .jpg.webp from a
 * WordPress image plugin, and the API answered "file format is invalid
 * or unsupported". Re-encoding removes the question: one format reaches
 * the model whatever the CDN felt like serving, and the payload is
 * bounded at the same time.
 *
 * Bytes sharp cannot read are never forwarded. A host answering a bot
 * check with an HTML page under an image content-type would otherwise
 * sail through this function and fail at the API, where the error
 * describes our request rather than their page.
 */
async function asJpeg(
  buf: Buffer,
  contentType: string | null
): Promise<FallbackResult> {
  try {
    const sharp = (await import("sharp")).default;
    const image = sharp(buf);
    const meta = await image.metadata();
    const jpeg = await image
      .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer();
    return {
      image: { data: jpeg.toString("base64"), mediaType: "image/jpeg" },
      note: `fetched ${buf.byteLength}B ${contentType ?? "?"} (${meta.format} ${meta.width}x${meta.height}), sent ${jpeg.byteLength}B jpeg`,
    };
  } catch (err) {
    // sharp missing from the runtime (it was, on Vercel, 2026-09-23..26:
    // libvips wasn't shipped with the function) must not cost the clip its
    // tags. If the bytes are already a format the model takes and small
    // enough to send, send them as they are.
    const sniffed = sniffImageType(buf);
    const raw = sniffed && (SUPPORTED as readonly string[]).includes(sniffed)
      ? (sniffed as SupportedMediaType)
      : null;
    if (raw && buf.byteLength <= MAX_RAW_BYTES) {
      return {
        image: { data: buf.toString("base64"), mediaType: raw },
        note: `fetched ${buf.byteLength}B ${contentType ?? "?"}, sent as-is (${raw}); sharp unavailable: ${
          err instanceof Error ? err.message.split("\n")[0] : String(err)
        }`,
      };
    }
    return {
      image: null,
      note: `fetched ${buf.byteLength}B ${contentType ?? "?"} but could not decode it: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

/**
 * What the first bytes say the file is, whatever the header claims. Enough
 * to tell a real image from an HTML bot-check page served as image/jpeg,
 * without decoding anything.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  const b = bytes;
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  const ascii = (i: number, n: number) =>
    String.fromCharCode(...Array.from(b.subarray(i, i + n)));
  if (b.length < 4) return null;
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (/^(heic|heix|mif1|msf1)$/.test(brand)) return "image/heic";
  }
  if (ascii(0, 2) === "BM") return "image/bmp";
  if (at(0, 0x49, 0x49, 0x2a, 0x00) || at(0, 0x4d, 0x4d, 0x00, 0x2a)) return "image/tiff";
  const head = ascii(0, Math.min(b.length, 256)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
    return "image/svg+xml";
  }
  return null;
}

export type DoorCheck = { readable: boolean; note: string };

/**
 * The door check (lib/clips/create.ts): is there an image at this address?
 *
 * Deliberately not the classifier fallback. It reads the first bytes and
 * stops — no decode, so it can't depend on sharp (whose absence on Vercel
 * refused nearly every clip from 2026-09-25 to 26) — and it only says no
 * when the answer is certain: the host says the file is gone, or what
 * comes back is plainly not an image. A slow host, a network error, or a
 * bot wall that refuses servers but serves browsers is not a reason to
 * turn a curator away; those clips save and the classifier tries later.
 * No robots.txt gate here either: this is one person saving one image
 * they are looking at, not a crawl.
 */
export async function checkImageReadable(
  imageUrl: string,
  pageUrl: string
): Promise<DoorCheck> {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return { readable: false, note: "not a URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { readable: false, note: `protocol ${parsed.protocol}` };
  }
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "user-agent": BROWSER_USER_AGENT,
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer: pageUrl,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel().catch(() => {});
      return { readable: false, note: `host answered ${res.status}` };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { readable: true, note: `host answered ${res.status}; let through` };
    }
    const contentType = res.headers.get("content-type");
    const first = await firstBytes(res, 512);
    const sniffed = sniffImageType(first);
    if (sniffed) return { readable: true, note: `${sniffed}` };
    if (first.byteLength === 0) return { readable: false, note: "empty response" };
    const type = (contentType ?? "").toLowerCase();
    if (type.includes("text/html") || type.includes("application/json")) {
      return { readable: false, note: `host served ${contentType}` };
    }
    // An image/* we don't recognise (jxl, ico…) is still an image.
    if (isImageContentType(contentType)) return { readable: true, note: `${contentType}` };
    return { readable: false, note: `host served ${contentType ?? "no type"}` };
  } catch (err) {
    return {
      readable: true,
      note: `could not check (${err instanceof Error ? err.message : String(err)}); let through`,
    };
  }
}

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

async function firstBytes(res: Response, n: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < n) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}
