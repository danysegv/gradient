import Link from "next/link";
import { isPublished, type LegalPage } from "@/lib/legal";

// The ONE way to link /privacy or /rights. While the page's contact is a
// placeholder (lib/legal.ts) it renders `fallback` (nothing, by default),
// because a policy you can't write to is worse than no policy link at all.
// lib/privacy.test.ts and lib/rights.test.ts fail on any other link.
export function LegalLink({
  page,
  hash,
  className,
  children,
  fallback = null,
}: {
  page: LegalPage;
  hash?: string;
  className?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  if (!isPublished(page)) return <>{fallback}</>;
  return (
    <Link href={`/${page}${hash ? `#${hash}` : ""}`} className={className}>
      {children}
    </Link>
  );
}
