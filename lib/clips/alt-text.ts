// Alt text for clip images (WCAG 1.1.1), decided by Daniela 2026-10-05.
//
// The image IS the content of the library, so alt="" (decorative) was
// wrong everywhere a clip is shown. The alt text is the FIRST SENTENCE of
// Claude's literal description of the image, copied into clips.alt_text
// by lib/claude/describe-clip.ts. Only that sentence is published; the full
// description and its keywords stay search-only, as decided on 2026-09-11.
//
// Until a clip is described, its title stands in. Plate covers and
// curator-card thumbnails keep alt="": they sit inside a link already named
// by the plate or curator, so describing them would only add noise.

/** Long enough for one descriptive sentence, short enough to listen to. */
export const ALT_MAX = 250;

export function altFromSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const text = summary.replace(/\s+/g, " ").trim();
  if (!text) return null;
  // The first sentence: up to . ! or ? followed by a space and a capital,
  // digit or opening quote, or by the end. "1.5" and "2×2" never split.
  const m = text.match(/^(.+?[.!?])(?=\s+["'“(]?[A-Z0-9]|$)/);
  let first = (m ? m[1] : text).trim();
  if (first.length > ALT_MAX) {
    const cut = first.slice(0, ALT_MAX);
    const space = cut.lastIndexOf(" ");
    first = (space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, "") + "…";
  }
  return first;
}

/** What an <img> for a clip says to a screen reader. */
export function clipAlt(clip: { alt_text?: string | null; title?: string | null }): string {
  return clip.alt_text?.trim() || clip.title?.trim() || "";
}
