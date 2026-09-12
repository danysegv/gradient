import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { InvitationForm } from "./invitation-form";

export const metadata = {
  title: "Ask to join — 04AM",
  description:
    "04AM is a closed panel of working creatives. Membership is by invitation or vouch.",
};

// Deliberately NOT linked from the main navigation. The direction memo is
// explicit — no signup button — and the route exists to be the destination
// of a credited feature, not a banner on the feed. Reachable by typing it
// or from a link in an Instagram bio, which is exactly the intended path.
export default function InvitationPage() {
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
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone">
            Join
          </span>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-[1180px] px-8">
        <div className="pt-11 pb-2">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
            Closed beta — by invitation
          </p>
          <h1 className="mb-2.5 text-[34px] font-bold leading-tight tracking-tight">
            The panel is the product
          </h1>
          <p className="mb-6 max-w-xl text-[15px] leading-relaxed text-bone/75">
            04AM measures what working creatives choose to keep as reference.
            That number is only worth anything if the people doing the keeping
            are people whose eye you&rsquo;d trust. Two hundred art directors
            clipping is a professional panel. Two hundred thousand people
            clipping is a popularity contest.
          </p>
          <p className="mb-10 max-w-xl text-[15px] leading-relaxed text-bone/75">
            So there is no signup button, and the questions below are not
            paperwork &mdash; they are the filter. What you&rsquo;d clip first
            says more than any job title.
          </p>
        </div>

        <InvitationForm />

        <div className="mt-14 max-w-xl border-t border-white/10 pt-7">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-bone/70">
            What you&rsquo;d be joining
          </p>
          <p className="mb-4 text-[15px] leading-relaxed text-bone/75">
            A reference library that is clipped by hand, classified against a
            locked taxonomy, and measured for how fast each aesthetic is
            actually moving. Every reference is credited to whoever made it,
            not to the site it was found on.
          </p>
          <p className="text-[15px] leading-relaxed text-bone/75">
            Members clip. What you keep shows up in the numbers, under your
            name, on your own page. That is the whole arrangement.
          </p>
        </div>

        <footer className="mt-16 border-t border-white/10 py-10">
          <p className="max-w-xl text-xs leading-relaxed text-bone/70">
            Your email is used to answer you and nothing else. It is not on a
            mailing list, because there isn&rsquo;t one.
          </p>
        </footer>
      </div>
    </>
  );
}
