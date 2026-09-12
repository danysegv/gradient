// What 04AM is willing to claim. The feed must never rank by a figure the
// board has not published: before launch nothing is published, and after
// launch the withheld tags still aren't. One rule, read by both surfaces.

// PROVISIONAL — confirm the real publish hour with Daniela. This value must
// equal the moment the board actually goes live, nothing else. It must stay
// later than 2026-09-26T08:01Z (when the last 09-26 tag clears the age
// gate), and the board must publish strictly BEFORE this timestamp — a gate
// earlier than the real publish re-creates the exact bug this module
// exists to prevent, just in a smaller window.
export const BOARD_PUBLISHES_AT = Date.parse("2026-09-26T12:00:00Z");

// RawAsymmetry, HighEnergy, FrontalSymmetry — resolved once against the
// tags table (faxdpkqkufbywoxfmnka) on 2026-09-12. All three are also on
// the hold-copy list. Update here, never per-surface, if the hold list
// changes.
export const WITHHELD_TAG_IDS = new Set<string>([
  "7c928bb5-61a4-418a-bbf7-47f6b33baaaa", // RawAsymmetry
  "939fb056-9cd6-4a46-8422-ebf8b4cea3a2", // HighEnergy
  "8dacd81a-5958-4ee3-b226-a39a6d21a31c", // FrontalSymmetry
]);

export function publishedVelocities(
  all: ReadonlyMap<string, number>,
  now: number
): Map<string, number> {
  if (now < BOARD_PUBLISHES_AT) return new Map();
  return new Map([...all].filter(([id]) => !WITHHELD_TAG_IDS.has(id)));
}
