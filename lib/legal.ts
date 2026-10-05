// The two addresses 04AM's public promises depend on, in one place.
//
// /privacy and /rights are drafts until these are real inboxes. Both are
// .example (RFC 2606: can never be registered, so can never receive mail),
// which is what makes them safe placeholders and reliable tripwires.
//
// Every link to either page goes through components/legal-link.tsx, which
// renders nothing while the page's address is a placeholder. So the day
// the domain exists, changing the two lines below is the whole job: the
// footer, the cookie notice's link and the sign-up note all appear at once.
// lib/privacy.test.ts and lib/rights.test.ts read these literals.

export const PRIVACY_CONTACT = "privacy@04am.example";
export const RIGHTS_CONTACT = "rights@04am.example";

/** When /privacy last changed in substance. Shown on the page (CalOPPA). */
export const PRIVACY_UPDATED = "2026-10-05";

export function isPlaceholderAddress(address: string): boolean {
  return /\.(example|test|invalid|localhost)$/i.test(address.trim());
}

export type LegalPage = "privacy" | "rights";

export function isPublished(page: LegalPage): boolean {
  return !isPlaceholderAddress(page === "privacy" ? PRIVACY_CONTACT : RIGHTS_CONTACT);
}
