"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "./profile-actions";
import { BIO_MAX } from "@/lib/profiles/input";

// The one thing a curator writes about themselves, edited from the one page
// they sign in to. Their username is their name everywhere else on the site
// and isn't editable here — it comes from the clip data, not from a form.
export function ProfileEditor({
  curator,
  bio,
}: {
  curator: string;
  bio: string | null;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    undefined
  );

  return (
    <form action={action} className="flex w-full max-w-md flex-col items-start gap-4">
      <div>
        <p className="text-[15px] font-semibold">{curator}</p>
        <p className="mt-0.5 text-[11px] text-bone/55">
          Your username. It&rsquo;s how you&rsquo;re credited everywhere.
        </p>
      </div>

      <label className="flex w-full flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-bone/70">
          Bio
        </span>
        <textarea
          id="profile-bio"
          name="bio"
          defaultValue={bio ?? ""}
          maxLength={BIO_MAX}
          rows={3}
          placeholder="What you look for, in a line or two."
          className="resize-y rounded-[3px] border border-white/15 bg-ink-2 px-3 py-2 text-[15px] leading-relaxed text-bone placeholder:text-bone/40 focus:border-bone/60 focus:outline-none"
        />
        <span className="text-[11px] text-bone/50">
          Up to {BIO_MAX} characters. Shown on your curator page and in the
          roster — leave it blank and neither shows one.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save bio"}
        </button>
        {state?.ok && !pending && (
          <span className="text-sm text-bone/70">Saved.</span>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
