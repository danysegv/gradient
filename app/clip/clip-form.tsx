"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClip } from "./actions";
import { CLIP_IMAGE_REFERRER_POLICY } from "@/lib/clip-images";

// The /clip form, in the house style (2026-09-25): the auth forms' fields,
// small uppercase labels, one Bone button. Beside it, the clip as it will
// be kept — the image whole, from its own server, with the credit line
// composed from what has been typed so far. Nothing here changes what is
// sent: every field keeps its name, and createClip / parseClipInput are
// untouched, so the form and the extension still accept exactly the same
// clips.

const FIELD =
  "h-12 w-full rounded-[4px] border border-white/15 bg-ink px-4 text-[15px] text-bone placeholder:text-bone/35 focus:border-bone/70 focus:outline-none";
const LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-bone/70";
const HINT = "font-normal normal-case tracking-normal text-bone/45";

type Draft = {
  url: string;
  image_url: string;
  title: string;
  creator: string;
  rights_holder: string;
  found_via: string;
  source_year: string;
};

const EMPTY: Draft = {
  url: "",
  image_url: "",
  title: "",
  creator: "",
  rights_holder: "",
  found_via: "",
  source_year: "",
};

function host(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function ClipForm() {
  const [state, action, pending] = useActionState(createClip, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the form reset above
      setDraft(EMPTY);
    }
  }, [state]);

  const onInput = (e: React.FormEvent<HTMLFormElement>) => {
    const t = e.target as HTMLInputElement;
    if (t.name in EMPTY) setDraft((d) => ({ ...d, [t.name]: t.value }));
  };

  return (
    <div className="grid gap-x-10 gap-y-10 md:grid-cols-12 lg:gap-x-12">
      <form
        ref={formRef}
        action={action}
        onInput={onInput}
        className="flex flex-col gap-6 md:col-span-7"
      >
        <Field id="url" label="Page URL" hint="where the work lives" required>
          <input id="url" name="url" type="url" required placeholder="https://" className={`${FIELD} h-14 text-[16px]`} />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="image_url" label="Image URL" hint="the image file itself">
            <input id="image_url" name="image_url" type="url" placeholder="https://…/image.jpg" className={FIELD} />
          </Field>
          <Field id="title" label="Title">
            <input id="title" name="title" type="text" className={FIELD} />
          </Field>
        </div>

        {/* Attribution, split four ways as of 2026-08-29. This was one
            "Source" field with the placeholder "Behance, Dribbble,
            Instagram…", which invited a discovery platform — and creators,
            publishers and finders all ended up in the same box. 79 source
            strings had to be untangled by hand as a result. Four fields
            that cannot be confused for each other. */}
        <fieldset className="border-t border-white/10 pt-6">
          <legend className={`${LABEL} mb-5 float-left w-full`}>Credit</legend>
          <div className="clear-both grid gap-6 sm:grid-cols-2">
            <Field id="creator" label="Creator" hint="who made it">
              <input id="creator" name="creator" type="text" placeholder="Photographer, designer, studio" className={FIELD} />
            </Field>
            <Field id="rights_holder" label="Rights holder" hint="who published or owns it">
              <input id="rights_holder" name="rights_holder" type="text" placeholder="Brand, publisher, museum" className={FIELD} />
            </Field>
            <Field id="found_via" label="Found via" hint="never a credit">
              <input id="found_via" name="found_via" type="text" placeholder="Designspiration, Fonts in Use…" className={FIELD} />
            </Field>
            <Field id="source_year" label="Work year" hint="when it was made, not clipped">
              <input
                id="source_year"
                name="source_year"
                type="number"
                inputMode="numeric"
                min={1400}
                max={new Date().getFullYear() + 1}
                placeholder="1976"
                className={`${FIELD} tabular-nums`}
              />
            </Field>
          </div>
        </fieldset>

        <Field id="caption" label="Caption">
          <textarea
            id="caption"
            name="caption"
            rows={3}
            className="w-full resize-y rounded-[4px] border border-white/15 bg-ink px-4 py-3 text-[15px] leading-relaxed text-bone placeholder:text-bone/35 focus:border-bone/70 focus:outline-none"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-5">
          <button
            disabled={pending}
            type="submit"
            className="h-14 rounded-[4px] bg-bone px-10 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save clip"}
          </button>
          <p role={state?.error ? "alert" : "status"} className="flex items-center gap-2 text-[14px] text-bone/80">
            {state?.error && (
              <>
                <span aria-hidden className="h-2 w-2 flex-none bg-oxide" />
                <span className="text-bone">{state.error}</span>
              </>
            )}
            {state?.success && "Saved. It is read and tagged on its own, usually within seconds."}
          </p>
        </div>
      </form>

      <Preview draft={draft} />
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
        {required && <span className="text-bone/45"> *</span>}
        {hint && <span className={HINT}> — {hint}</span>}
      </label>
      {children}
    </div>
  );
}

// The clip as it will be kept. Same rules as everywhere else: whole, from
// the rights holder's server, never cropped. The credit line follows the
// clip page's order — maker first, then owner, then year; "via" last and
// quieter, because a platform is never a credit.
function Preview({ draft }: { draft: Draft }) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const src = draft.image_url.trim();
  const broken = src !== "" && failedFor === src;
  const credit = [draft.creator, draft.rights_holder, draft.source_year].map((s) => s.trim()).filter(Boolean);
  const pageHost = host(draft.url);

  return (
    <aside className="md:col-span-5" aria-label="Preview">
      {/* Stays in its place on the page (Daniela, 2026-09-25). It used to
          be sticky and follow the scroll; same look, no following. */}
      <div>
        <p className={`${LABEL} mb-3`}>As it will be kept</p>
        <div className="flex min-h-[260px] items-center justify-center border border-white/10 bg-ink-2 p-5 [background-image:linear-gradient(rgba(231,227,216,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(231,227,216,0.04)_1px,transparent_1px)] [background-size:32px_32px]">
          {src && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element -- rights holder's own server, shown whole
            <img
              key={src}
              src={src}
              alt={draft.title || ""}
              referrerPolicy={CLIP_IMAGE_REFERRER_POLICY}
              onError={() => setFailedFor(src)}
              className="block h-auto max-h-[52vh] w-auto max-w-full"
            />
          ) : (
            <p className="max-w-[30ch] text-center text-[13px] leading-relaxed text-bone/50">
              {broken
                ? "This image won’t load. The host may block it, or the address is a page rather than the image file. Try the image file’s own address."
                : "Paste an image URL and the reference appears here, whole."}
            </p>
          )}
        </div>
        <div className="mt-4 min-h-[64px]">
          <p className="text-[17px] font-semibold leading-snug text-bone">
            {draft.title.trim() || <span className="text-bone/35">Title</span>}
          </p>
          <p className="mt-1 text-[13px] text-bone/70">
            {credit.length > 0 ? credit.join(", ") : <span className="text-bone/35">Creator, rights holder, year</span>}
            {draft.found_via.trim() && <span className="text-bone/45"> · via {draft.found_via.trim()}</span>}
          </p>
          {pageHost && <p className="mt-1 text-[12px] text-bone/45">{pageHost}</p>}
        </div>
      </div>
    </aside>
  );
}
