// Cleaning what the describer returns before it is stored. Pure and tested.
// Mirrors clip_descriptions: summary at most 600 characters.

export const SUMMARY_MAX = 600;
export const KEYWORDS_MAX = 40;
const KEYWORD_LENGTH_MAX = 48;

export function normaliseDescription(input: {
  summary: string;
  keywords: string[];
}): { summary: string; keywords: string[] } {
  let summary = input.summary.replace(/\s+/g, " ").trim();
  if (summary.length > SUMMARY_MAX) {
    const cut = summary.slice(0, SUMMARY_MAX);
    const lastSpace = cut.lastIndexOf(" ");
    summary = (lastSpace > SUMMARY_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
  }

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of input.keywords) {
    const k = raw.replace(/\s+/g, " ").trim().toLowerCase();
    if (!k || k.length > KEYWORD_LENGTH_MAX || seen.has(k)) continue;
    seen.add(k);
    keywords.push(k);
    if (keywords.length === KEYWORDS_MAX) break;
  }
  return { summary, keywords };
}
