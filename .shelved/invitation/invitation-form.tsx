"use client";

import { useActionState } from "react";
import { requestInvitation } from "./actions";

const FIELD =
  "rounded border border-white/20 bg-ink-2 px-3.5 py-2.5 text-[15px] text-bone placeholder:text-bone/35 focus:border-bone/60 focus:outline-none";
const LABEL = "text-[13px] font-semibold text-bone";
const HINT = "text-xs text-bone/60";

export function InvitationForm() {
  const [state, action, pending] = useActionState(requestInvitation, undefined);

  if (state?.success) {
    return (
      <div className="rounded-lg border border-white/10 bg-ink-2 p-7">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
          <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
          Request received
        </p>
        <p className="max-w-lg text-[15px] leading-relaxed text-bone/75">
          That&rsquo;s with us. There is no queue position and no automatic
          yes &mdash; two people read these, and they answer the ones they can
          say something useful to. If that&rsquo;s you, it won&rsquo;t be a
          form letter.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex max-w-xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={LABEL}>Name</label>
        <input id="name" name="name" required maxLength={120} className={FIELD} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={LABEL}>Email</label>
        <input id="email" name="email" type="email" required maxLength={320} className={FIELD} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className={LABEL}>What you do</label>
          <input id="role" name="role" maxLength={120} placeholder="Art director, designer, photographer…" className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="studio" className={LABEL}>Where</label>
          <input id="studio" name="studio" maxLength={160} placeholder="Studio, agency, freelance" className={FIELD} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="portfolio_url" className={LABEL}>
          Somewhere your taste is visible
        </label>
        <input id="portfolio_url" name="portfolio_url" maxLength={500} placeholder="Portfolio, Instagram, Are.na…" className={FIELD} />
        <p className={HINT}>A link beats a title. It doesn&rsquo;t have to be a portfolio site.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="vouched_by" className={LABEL}>
          Who vouches for you <span className="font-normal text-bone/60">— optional</span>
        </label>
        <input id="vouched_by" name="vouched_by" maxLength={160} placeholder="Someone already clipping here" className={FIELD} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="would_clip" className={LABEL}>
          What would you clip first?
        </label>
        <textarea id="would_clip" name="would_clip" rows={4} maxLength={1000} className={FIELD} />
        <p className={HINT}>
          The one that actually matters. A reference you saw this week and
          kept thinking about &mdash; and why.
        </p>
      </div>

      {/* Honeypot. Hidden from people, irresistible to bots. Keeps a
          CAPTCHA off the page, which nobody should have to solve to tell
          you what they'd clip. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {/* Oxide measures ~3.6:1 on Ink and fails 4.5:1 below 24px, so the
          message is Bone and the colour survives as a non-text mark. Same
          rule as the eyebrows elsewhere. */}
      {state?.error && (
        <p role="alert" className="flex items-center gap-2 text-[14px] text-bone">
          <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded border border-white/25 px-6 py-3 text-[13px] font-semibold uppercase tracking-wide text-bone transition-colors hover:border-bone hover:bg-bone hover:text-ink disabled:opacity-50"
      >
        {pending ? "Sending…" : "Ask to join"}
      </button>
    </form>
  );
}
