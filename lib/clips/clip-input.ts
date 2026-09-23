// What a new clip is allowed to carry, checked once for every way in: the
// /clip form (FormData) and the browser extension (JSON). Pure, so the
// rules are tested rather than assumed, and so the two doors can never
// drift into accepting different things.
//
// Link-only intake (CLAUDE.md legal note): a clip is two public web
// addresses plus words. No file, no data: URL, no blob: URL — any of those
// would mean 04AM storing a copy of the work instead of pointing at it.

export type ClipInput = {
  url: string;
  image_url: string | null;
  title: string | null;
  caption: string | null;
  creator: string | null;
  rights_holder: string | null;
  found_via: string | null;
  source_year: number | null;
};

export type ClipInputResult =
  | { ok: true; value: ClipInput }
  | { ok: false; error: string };

// The year the WORK was made — never the clip date, which velocity depends
// on. Mirrors the clips_source_year_plausible check constraint, so a typo
// returns a sentence rather than a Postgres error.
export const YEAR_MIN = 1400;

// Generous: long enough for any real title or signed CDN address, short
// enough that nobody can post a novel through the extension endpoint.
const MAX_URL = 4096;
const MAX_SHORT = 500;
const MAX_CAPTION = 4000;

/** A public web address: http or https, nothing else. */
export function isPublicWebUrl(value: string): boolean {
  if (value.length > MAX_URL) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function text(raw: unknown, max: number): string | null | { tooLong: true } {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.length > max) return { tooLong: true };
  return v;
}

/**
 * Reads a clip from any key/value source. `get` returns whatever the
 * transport holds for that key (FormData entry, JSON property).
 */
export function parseClipInput(
  get: (key: string) => unknown,
  now: Date = new Date()
): ClipInputResult {
  const url = get("url");
  if (typeof url !== "string" || !isPublicWebUrl(url.trim())) {
    return { ok: false, error: "Enter a valid URL." };
  }

  const imageRaw = get("image_url");
  let image_url: string | null = null;
  if (typeof imageRaw === "string" && imageRaw.trim()) {
    const v = imageRaw.trim();
    if (/^(data|blob):/i.test(v)) {
      return {
        ok: false,
        error: "That image isn't at a public web address, so 04AM can't link to it.",
      };
    }
    if (!isPublicWebUrl(v)) return { ok: false, error: "Image URL isn't valid." };
    image_url = v;
  }

  const fields = {
    title: text(get("title"), MAX_SHORT),
    caption: text(get("caption"), MAX_CAPTION),
    creator: text(get("creator"), MAX_SHORT),
    rights_holder: text(get("rights_holder"), MAX_SHORT),
    found_via: text(get("found_via"), MAX_SHORT),
  };
  for (const [key, v] of Object.entries(fields)) {
    if (v && typeof v === "object") {
      return { ok: false, error: `${label(key)} is too long.` };
    }
  }

  let source_year: number | null = null;
  const yearRaw = get("source_year");
  const yearText =
    typeof yearRaw === "number" ? String(yearRaw) : typeof yearRaw === "string" ? yearRaw.trim() : "";
  if (yearText) {
    const year = Number(yearText);
    const max = now.getUTCFullYear() + 1;
    if (!Number.isInteger(year) || year < YEAR_MIN || year > max) {
      return {
        ok: false,
        error: `Work year must be a whole number between ${YEAR_MIN} and ${max}.`,
      };
    }
    source_year = year;
  }

  return {
    ok: true,
    value: {
      url: url.trim(),
      image_url,
      title: fields.title as string | null,
      caption: fields.caption as string | null,
      creator: fields.creator as string | null,
      rights_holder: fields.rights_holder as string | null,
      found_via: fields.found_via as string | null,
      source_year,
    },
  };
}

function label(key: string): string {
  return (
    {
      title: "Title",
      caption: "Caption",
      creator: "Creator",
      rights_holder: "Rights holder",
      found_via: "Found via",
    } as Record<string, string>
  )[key] ?? key;
}
