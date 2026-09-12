// Colour search works on buckets, not on distance. The search bar's swatch
// row is a dozen discrete choices, so a clip's colours are sorted into those
// same dozen once, when the clip is described, and the query is then a
// straight match rather than a nearest-neighbour scan. That keeps colour
// search in Postgres alongside everything else and means a swatch can never
// return "sort of" results.
//
// Nothing here touches clip_tags. A colour is not a tag: it carries no
// axis, no confidence, and it never enters a count, a share, a velocity or
// a denominator. Same boundary as clip_descriptions, for the same reason.

export const COLOR_BUCKETS = [
  { id: "red", label: "Red", swatch: "#c8352f" },
  { id: "orange", label: "Orange", swatch: "#d26a2a" },
  { id: "yellow", label: "Yellow", swatch: "#d8b02c" },
  { id: "green", label: "Green", swatch: "#4e8f45" },
  { id: "teal", label: "Teal", swatch: "#2f8b86" },
  { id: "blue", label: "Blue", swatch: "#33619f" },
  { id: "violet", label: "Violet", swatch: "#6a4b9c" },
  { id: "pink", label: "Pink", swatch: "#bf4f86" },
  { id: "brown", label: "Brown", swatch: "#7a5433" },
  { id: "black", label: "Black", swatch: "#141318" },
  { id: "grey", label: "Grey", swatch: "#8b8a90" },
  { id: "white", label: "White", swatch: "#eae7de" },
] as const;

export type ColorBucket = (typeof COLOR_BUCKETS)[number]["id"];

const BUCKET_IDS = new Set<string>(COLOR_BUCKETS.map((b) => b.id));

export function isColorBucket(value: unknown): value is ColorBucket {
  return typeof value === "string" && BUCKET_IDS.has(value);
}

/** #rgb or #rrggbb, case-insensitive, to 0-255 channels. Null if unparseable. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  const full =
    h.length === 3
      ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Hue 0-360, saturation and lightness 0-1. */
export function toHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

/**
 * Which swatch a colour belongs to.
 *
 * Order matters, and the achromatic tests come first — but they test
 * CHROMA, the raw spread between the strongest and weakest channel, not
 * HSL saturation. HSL saturation lies at the ends of the lightness range:
 * #f7f6f2, an off-white five points of red away from neutral, reports 24%
 * saturation and a hue of 48deg, which would file every warm paper scan in
 * the library under Yellow. Chroma says 2% and means it.
 *
 * Brown comes next, because brown has no hue of its own: it is dark or
 * muted orange, and without an explicit rule every sepia print and wooden
 * surface lands in Orange.
 */
export function bucketOf(hex: string): ColorBucket | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const [h, s, l] = toHsl(r, g, b);
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

  if (l <= 0.09) return "black";
  if (chroma <= 0.06) {
    if (l < 0.22) return "black";
    if (l > 0.86) return "white";
    return "grey";
  }
  // A tinted off-white is still white: at this lightness a little chroma
  // is a paper stock, not a colour.
  if (l >= 0.9 && chroma <= 0.14) return "white";

  if (h >= 8 && h < 50 && (l < 0.38 || (s < 0.35 && l < 0.55))) return "brown";

  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "teal";
  if (h < 250) return "blue";
  if (h < 290) return "violet";
  return "pink";
}
