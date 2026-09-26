// Likes are a plate (Daniela, 2026-09-25): liking a clip saves it to a
// private plate called "Obsessions" on the curator's profile, made the first
// time they like something. It is an ordinary plate in every other way —
// it shows on their profile, opens like any plate, can be rearranged —
// so nothing new had to learn how to display it.
//
// Found by slug, which is fixed at creation (lib/boards/slug.ts): renaming
// the plate's title never breaks liking.

export const LIKES_SLUG = "obsessions";
export const LIKES_TITLE = "Obsessions";
