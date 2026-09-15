// How 04AM asks a rights holder's server for their image.
//
// One constant, imported by both places that render a remote clip image, so
// the answer can't drift apart between the grid and a board cover.

/**
 * Decided 2026-09-15 by Daniela, replacing an inherited `no-referrer`.
 *
 * 04AM hosts nothing — every clip image is fetched by the visitor's browser
 * from the rights holder's own server (see the legal note in CLAUDE.md).
 * That makes the `Referer` header the only signal the source gets that 04AM
 * exists, and `no-referrer` withheld it: the source could not see the
 * traffic, could not attribute it, and could not hotlink-block if they
 * objected. Sitting next to a rights page that promises credit and a link
 * back, that was a promise the code didn't keep.
 *
 * `strict-origin-when-cross-origin` sends the ORIGIN and nothing more. The
 * source sees that 04AM is displaying their work and can act on it; they
 * never see which page, and never see a `?q=` search query. Being blockable
 * is the point, not a cost — a rights holder who can opt out with a server
 * rule is a rights holder who did not need to send a takedown, and the
 * ability to opt out is worth a great deal in good faith.
 *
 * The risk this accepts: a host that serves an image precisely BECAUSE no
 * referrer arrives may start refusing one that carries an origin. Click
 * through the grid, a board, and a clip page after any change here.
 */
export const CLIP_IMAGE_REFERRER_POLICY = "strict-origin-when-cross-origin";
