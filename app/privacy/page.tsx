import { SiteHeader } from "@/components/site-header";

// DRAFT — written 2026-09-24, approved by neither Daniela nor a lawyer.
// Not linked from anywhere yet, on purpose, and lib/privacy.test.ts fails
// the build if anything links to it while the address below is a
// placeholder. See claude/04am-browser-extension-2026-09-23.md.
//
// This page exists because the Chrome Web Store requires one: the clipper
// handles authentication information (an email and password) and website
// content (the addresses of pages a curator visits while clipping), both
// of which Google classifies as user data. No privacy policy, no listing.
//
// Everything here is a description of what the code actually does today —
// checked against lib/clips/image-bytes.ts, lib/claude/classify-clip.ts,
// app/api/extension/*, lib/clip-session.ts and extension/. If any of those
// change, this page is wrong and has to change with them.
//
// Set this before linking the page anywhere OR submitting to any store. A
// privacy policy whose contact address can never receive mail is worse
// than no page at all. The .example TLD is reserved by RFC 2606 and can
// never be registered, which is what makes it a safe placeholder and a
// reliable tripwire.
const PRIVACY_CONTACT = "privacy@04am.example";

export const metadata = {
  title: "Privacy — 04AM",
  description:
    "What 04AM and the 04AM Clipper collect, what they never collect, and who else sees it.",
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

function Contact() {
  return (
    <a
      href={`mailto:${PRIVACY_CONTACT}`}
      className="text-bone underline underline-offset-4"
    >
      {PRIVACY_CONTACT}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />

      <main className="px-8 py-12">
        <h1 className="mb-3 text-[34px] font-semibold leading-tight text-bone">
          Privacy
        </h1>
        <p className="max-w-[62ch] text-[15px] leading-relaxed text-bone/60">
          04AM is a reference library and a browser extension for putting
          references into it. This page covers both, and describes what the
          software actually does rather than what it might one day do.
        </p>

        <Section heading="Your account">
          <p>
            Signing up asks for an email address and a password, and nothing
            else. They are handled by Supabase, which stores the password
            hashed; 04AM never sees or keeps the password itself. Your email
            is used to sign you in, to confirm the address, and to send a
            reset link if you ask for one. It is never shown publicly and
            never used for marketing.
          </p>
          <p>
            An account on its own is a reader&rsquo;s account. Only accounts an
            administrator has approved as curators can add references.
          </p>
        </Section>

        <Section heading="What is public">
          <p>
            A curator&rsquo;s username, display name and biography are public,
            as is every reference they add: the link, the credits, and the
            date. That is the point of the library — a reference with no
            visible provenance is worth less than one with it. Which person
            sits behind a curator name is not public.
          </p>
          <p>
            Readers browse and search without an account being required for
            anything that is public.
          </p>
        </Section>

        <Section heading="What the clipper sends">
          <p>
            The 04AM Clipper is a browser extension for approved curators. It
            does nothing at all until you ask it to: it is granted access to a
            page only at the moment you click its icon, use its right-click
            item, or press its shortcut. It is never running in the background
            on the pages you read.
          </p>
          <p>
            When you clip something, it sends 04AM two web addresses — the
            page you are on and the image you picked — plus whatever you type
            into the form, and the title, caption or credit the page itself
            publishes, if you choose to accept those. The address is stripped
            of tracking parameters first.
          </p>
          <p>
            It never sends the image itself. No screenshots, no uploads, no
            copies: a clip is a link. It does not read your browsing history,
            your bookmarks, your other tabs, or any page you have not asked it
            to look at.
          </p>
          <p>
            Signing in through the extension sends your email and password to
            04AM, once, in exchange for a session token. That token is kept in
            the browser&rsquo;s own extension storage on your computer, and it
            is what the extension sends afterwards. Signing out discards it.
          </p>
        </Section>

        <Section heading="The images, and the model that reads them">
          <p>
            Every reference is classified and described by Anthropic&rsquo;s
            Claude, which is how the library can be searched by what things
            look like. Normally 04AM hands Claude the image&rsquo;s public
            address and Anthropic&rsquo;s servers fetch it, so 04AM never
            touches the file.
          </p>
          <p>
            Some sites refuse that fetch. For those, and only those, 04AM
            requests the image once itself and passes it into the same call.
            Nothing is written to disk or to a database, and the bytes are
            dropped when the request ends. A site that asks machines not to
            read it in its robots.txt is left alone.
          </p>
          <p>
            Those descriptions are used for search inside 04AM. They are not
            published, and they are not used to train anything.
          </p>
        </Section>

        <Section heading="Who else is involved">
          <p>
            Three companies process data on 04AM&rsquo;s behalf: Supabase
            stores the database and runs sign-in, Vercel hosts the site and
            keeps ordinary server logs, and Anthropic runs the model that
            reads each image. Nobody else receives anything.
          </p>
          <p>
            There is no advertising on 04AM, no tracking or analytics script
            of any kind on the site or in the extension, and nothing is sold
            or shared for advertising. Data from the clipper is used for one
            purpose only: putting the reference you chose into the library.
          </p>
        </Section>

        <Section heading="Cookies and local storage">
          <p>
            The site sets a cookie to keep you signed in, and one to remember
            that you have already seen the opening screen. The extension keeps
            its session token, and your choice of which 04AM it talks to, in
            the browser&rsquo;s extension storage. None of it follows you to
            other sites.
          </p>
        </Section>

        <Section heading="Keeping, removing and asking">
          <p>
            A reference can be archived, which removes it from the library and
            from every figure computed from it. Accounts and their profiles
            are kept while they exist; to have yours and its data deleted,
            write to <Contact /> and we will do it by hand.
          </p>
          <p>
            You can ask what is held about you, ask for it to be corrected, or
            ask for it to be removed, at the same address. If your work
            appears in the library and you would like it credited differently
            or taken down, that is a separate page and a separate route.
          </p>
        </Section>
      </main>
    </>
  );
}
