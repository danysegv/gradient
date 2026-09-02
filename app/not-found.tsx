import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

// Deliberately dependency-free — no Supabase call, no dynamic data.
// A 404 page that queries the database breaks precisely when the database
// is what broke, and this is the surface a stranger is most likely to hit
// first. It also lets Next prerender it as static.
//
// Voice matches the confidence vocabulary the rest of the product uses:
// Early Signal, Cooling, Panel Skew. "No Signal" belongs to that family —
// the system saying plainly what it does not have.
export default function NotFound() {
  return (
    <>
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-7">
        <Link href="/" aria-label="04AM — Signals Feed">
          <Wordmark className="h-[22px] text-bone" />
        </Link>
        <nav className="flex items-center gap-7">
          <Link
            href="/"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Signals
          </Link>
          <Link
            href="/curators"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Curators
          </Link>
          <Link
            href="/clip"
            className="rounded bg-oxide px-4 py-2 text-[13px] font-semibold tracking-wide text-bone"
          >
            + Clip
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col justify-center px-8 py-24">
        <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
          <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
          404 — no signal
        </p>
        <h1 className="mb-2.5 text-[34px] font-bold leading-tight tracking-tight">
          No references at this address
        </h1>
        <p className="mb-9 max-w-xl text-[15px] leading-relaxed text-bone/75">
          Nothing in the library answers to that name. Either it was never
          clipped, or it is filed under a different spelling — tags and
          curators both live under their exact editorial names.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded border border-white/25 px-5 py-2.5 text-[13px] font-semibold uppercase tracking-wide text-bone transition-colors hover:border-bone hover:bg-bone hover:text-ink"
          >
            Back to the Signals Feed
          </Link>
        </div>
      </main>

      <div className="mx-auto w-full max-w-[1180px] px-8">
        <footer className="border-t border-white/10 py-10">
          <p className="max-w-xl text-xs leading-relaxed text-bone/70">
            Every reference in 04AM was clipped by hand and classified against
            a locked taxonomy. If you followed a link here from somewhere that
            should work, the piece may have been archived since.
          </p>
        </footer>
      </div>
    </>
  );
}
