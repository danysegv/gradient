// Deterministic attribution from the URL, before any model is involved.
//
// `found_via` is the one attribution field that is a FACT about the clip,
// not a judgement about the work: it is the site the reference was taken
// from. A model should never be asked to guess it, and a human should
// never have to type it — both introduce the exact variance that made the
// old free-text `source` field unusable.
//
// Two real bugs this permanently fixes, both found in the 2026-08-29
// attribution pass over the first 154 clips:
//   - PICDIT was typed three ways ("Design Inspiration", "PICDIT",
//     "PIC DIT") across six clips, all from picdit.net.
//   - AnOther Magazine was cased two ways across four clips.
// Keyed on the host, those collapse to one canonical spelling forever.

/** Known discovery platforms, keyed by host suffix. */
const FINDERS: [suffix: string, name: string][] = [
  ["designspiration.com", "Designspiration"],
  ["picdit.net", "PICDIT"],
  ["coverjunkie.com", "CoverJunkie"],
  ["awwwards.com", "Awwwards"],
  ["fontsinuse.com", "Fonts in Use"],
  ["itsnicethat.com", "It's Nice That"],
  ["thisiscolossal.com", "Colossal"],
  ["typographicposters.com", "typo/graphic posters"],
  ["visualjournal.it", "Visual Journal"],
  ["iso50.com", "ISO50 Blog"],
  ["magculture.com", "magCulture"],
  ["abduzeedo.com", "Abduzeedo"],
  ["secretgang.world", "Secret Gang"],
  ["dossiermag.net", "Dossier"],
  ["theindex.la", "The Index"],
  ["aperture.org", "Aperture"],
  ["lomography.com", "Lomography"],
  ["unsplash.com", "Unsplash"],
  ["giphy.com", "GIPHY"],
  ["instagram.com", "Instagram"],
  ["pinterest.com", "Pinterest"],
  ["pinterest.co.uk", "Pinterest"],
  ["tumblr.com", "Tumblr"],
  ["behance.net", "Behance"],
  ["dribbble.com", "Dribbble"],
  ["imdb.com", "IMDb"],
  ["moshtix.com.au", "Moshtix"],
  ["refinery29.com", "Refinery29"],
  ["dazeddigital.com", "Dazed"],
  ["anothermag.com", "AnOther Magazine"],
  ["vogue.com", "Vogue"],
  ["collectorsweekly.com", "Collectors Weekly"],
];

/**
 * The canonical finder for a URL, or null when the host is not a known
 * discovery platform.
 *
 * Null is deliberate and is the common case. An unknown host is very
 * often the creator's OWN site (felixbell.com, paulgacon.com,
 * norte.studio), and labelling that as "found via" would be false — the
 * work was not discovered somewhere else, it was taken from the maker.
 * Better to leave it empty and let a human or the classifier decide than
 * to file every artist's portfolio as an aggregator.
 */
export function foundViaFromUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  for (const [suffix, name] of FINDERS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return name;
  }
  return null;
}

/** True when this host is a known aggregator — never a credit. */
export function isKnownFinder(url: string): boolean {
  return foundViaFromUrl(url) !== null;
}

/** Every canonical finder name, for prompts and for tests. */
export function knownFinderNames(): string[] {
  return [...new Set(FINDERS.map(([, name]) => name))].sort();
}

export type AttributionFields = {
  creator: string | null;
  rights_holder: string | null;
  found_via: string | null;
  source_year: number | null;
};

/**
 * The columns an inference is allowed to write: only those still empty.
 *
 * A human typing a credit always beats a model inferring one. This is the
 * rule that makes automatic attribution safe to run repeatedly — over the
 * whole library, on every reclassify — without ever eroding something
 * Daniela entered by hand.
 *
 * Pure so it can be tested. The rule is safety-critical: a wrong credit
 * is a liability, and silently replacing a right one would be worse than
 * never inferring at all.
 */
export function attributionPatch(
  current: AttributionFields,
  candidate: Partial<AttributionFields>
): Partial<AttributionFields> {
  const patch: Partial<AttributionFields> = {};
  for (const key of [
    "creator",
    "rights_holder",
    "found_via",
    "source_year",
  ] as const) {
    const existing = current[key];
    const proposed = candidate[key];
    if (existing === null && proposed !== null && proposed !== undefined) {
      // @ts-expect-error -- key is a literal union; the value types line up per key
      patch[key] = proposed;
    }
  }
  return patch;
}
