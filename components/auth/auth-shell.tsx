import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

// The frame every account page shares: grid paper, the mark, one headline,
// one form. Same ground as the intro's sign-up, so moving between them
// feels like one place.
const GRID_PAPER =
  "bg-[linear-gradient(rgba(231,227,216,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(231,227,216,0.055)_1px,transparent_1px)] bg-[size:44px_44px]";

export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className={`flex min-h-screen flex-col bg-ink text-bone ${GRID_PAPER}`}>
      <div className="flex h-16 items-center justify-center">
        <Link href="/" aria-label="04AM — home">
          <Wordmark className="h-[20px] w-auto text-bone" />
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-24">
        <div className="w-full max-w-[420px] [animation:drop-in_300ms_cubic-bezier(.2,.8,.2,1)]">
          <h1 className="mb-8 text-center text-[36px] font-bold leading-[1.02] tracking-tight md:text-[44px]">
            {title}
          </h1>
          {children}
          {footer && (
            <div className="mt-8 text-center text-[14px] text-bone/60">{footer}</div>
          )}
        </div>
      </div>
    </main>
  );
}
