import { LegalLink } from "@/components/legal-link";
import { isPublished } from "@/lib/legal";

// One footer, rendered once in app/layout.tsx, so /privacy and /rights are
// reachable from every page (CalOPPA wants the privacy policy conspicuous
// from the homepage; the rights route is the 09-15 plan's footer link, whose
// old home went with the 09-19 rebrand).
//
// Renders nothing until at least one of the two pages has a real contact
// (lib/legal.ts) — an empty footer is noise. Then it appears everywhere at
// once, with no further change.
const LINK = "text-bone/55 transition-colors hover:text-bone";

export function SiteFooter() {
  if (!isPublished("privacy") && !isPublished("rights")) return null;
  return (
    <footer className="mt-auto border-t border-white/10 px-4 py-6 sm:px-8">
      <div className="flex flex-col gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] sm:flex-row sm:items-center sm:justify-between">
        <span className="text-bone/40">© {new Date().getFullYear()} 04AM</span>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
          <LegalLink page="privacy" className={LINK}>Privacy</LegalLink>
          <LegalLink page="privacy" hash="cookies" className={LINK}>Cookies</LegalLink>
          <LegalLink page="rights" className={LINK}>Rights &amp; takedowns</LegalLink>
        </nav>
      </div>
    </footer>
  );
}
