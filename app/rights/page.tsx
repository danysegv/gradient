import { SiteHeader } from "@/components/site-header";

// DRAFT — approved by neither Daniela nor a lawyer as of 2026-09-12. Not
// linked from anywhere yet, on purpose. See
// claude/04am-rights-posture-2026-09-12.md for what this page claims and why.
//
// Written for TODAY: four named curators, nothing public can be clipped. When
// clipping opens to users this page needs three more sections it deliberately
// doesn't have yet — the designated agent, a repeat-infringer termination
// policy (DMCA 512(i), and it must name real accounts, not shared secrets),
// and a counter-notice route. Claiming those before they're implemented is
// worse than not claiming them.
//
// Set this before linking the page anywhere. Deliberately not defaulted to
// a personal address: putting an inbox on a public page is Daniela's call.
//
// The .example TLD is reserved by RFC 2606 and can never be registered, so
// this address cannot silently deliver to a stranger while it waits. It is
// also the tripwire: lib/rights.test.ts fails the build if anything links
// to /rights while this is still a placeholder, because a takedown route
// that goes nowhere is worse than no page at all — it looks like a promise.
const RIGHTS_CONTACT = "rights@04am.example";

export const metadata = {
  title: "Rights & takedown — 04AM",
  description:
    "How 04AM shows other people's work, how to correct a credit, and how to have something removed.",
};

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/10 py-9">
      <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-bone/55">
        {heading}
      </h2>
      <div className="max-w-[62ch] space-y-4 text-[15px] leading-relaxed text-bone/85">
        {children}
      </div>
    </section>
  );
}

export default function RightsPage() {
  return (
    <>
      <SiteHeader />

      <main className="px-8 py-12">
        <h1 className="mb-3 text-[34px] font-semibold leading-tight text-bone">
          Rights &amp; takedown
        </h1>
        <p className="max-w-[62ch] text-[15px] leading-relaxed text-bone/60">
          04AM is a reference library. Everything in it was made by someone
          else, and we would rather credit them correctly than argue about it.
        </p>

        <Section heading="What 04AM is">
          <p>
            04AM is a hand-selected reference library used to read visual
            trends. A small number of named curators choose each image
            deliberately; nothing is uploaded by the public, and nothing is
            collected automatically.
          </p>
          <p>
            Each clip is shown alongside its source, its creator where we know
            it, and a link back to where it was published. The analysis on this
            site — which visual traits are moving, and how fast — is about
            patterns across the library, not about any single image.
          </p>
        </Section>

        <Section heading="We don&rsquo;t host the images">
          <p>
            This is the part most people want to know. 04AM does not store,
            copy or re-encode the images it shows. Each one is loaded by your
            browser directly from the site that published it, at that
            site&rsquo;s own address. Remove or move an image at the source and
            it stops appearing here, without us doing anything.
          </p>
          <p>
            Wherever a clip is shown as itself — in the feed, on a
            curator&rsquo;s page, on its own page, on a board — it is shown
            whole: never cropped, never zoomed, never reframed. Composition is
            part of the work, and cutting into it to fit a grid is an
            editorial decision we don&rsquo;t think is ours to make. The one
            exception is the small four-up thumbnail that identifies a board
            in a list, where images are squared off; click through and the
            work is whole again.
          </p>
          <p>
            Because your browser fetches each image from the source directly,
            that request tells the source it came from 04AM. We send our
            address and nothing else — never which page a reader was on, and
            never what they searched for. That is deliberate in both
            directions: you can see the traffic and attribute it, and if
            you&rsquo;d rather we didn&rsquo;t show your work at all, your own
            server can refuse us without you ever having to write to us.
          </p>
        </Section>

        <Section heading="If your credit is wrong">
          <p>
            Ask us to fix it — this is usually the faster and better outcome
            for everyone. Send the clip&rsquo;s link and the correct credit to{" "}
            <a className="underline" href={`mailto:${RIGHTS_CONTACT}`}>
              {RIGHTS_CONTACT}
            </a>
            , and we&rsquo;ll correct the attribution and the link back.
          </p>
        </Section>

        <Section heading="If you want it removed">
          <p>
            If you hold the rights to a work shown here and you want it gone,
            write to{" "}
            <a className="underline" href={`mailto:${RIGHTS_CONTACT}`}>
              {RIGHTS_CONTACT}
            </a>{" "}
            and include:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>the link to the clip on this site</li>
            <li>
              the work it reproduces, and where it was originally published
            </li>
            <li>
              enough for us to reach you, and a statement that you hold the
              rights or act for whoever does
            </li>
          </ul>
          <p>
            We remove on request. You do not need to argue fair use with us
            first, and we won&rsquo;t ask you to. A removed clip leaves the
            library and every count, share and trend figure derived from it.
          </p>
        </Section>

        <Section heading="Repeat requests">
          <p>
            A source that asks to be removed stays removed: we won&rsquo;t
            re-clip from it, and curators who do repeatedly lose access.
          </p>
        </Section>
      </main>
    </>
  );
}
