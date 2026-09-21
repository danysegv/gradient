"use client";

import { useActionState } from "react";
import { updateProfile, renameUsername, type ProfileState } from "./profile-actions";
import { BIO_MAX, DISPLAY_NAME_MAX } from "@/lib/profiles/input";
import {
  USERNAME_MAX,
  RENAME_COOLDOWN_DAYS,
  canRename,
  nextRenameAt,
} from "@/lib/profiles/username";

// What a curator writes about themselves, edited from the one page they
// sign in to: a display name and a bio. Their username is their name
// everywhere else on the site and isn't editable here — it comes from the
// clip data, not from a form.
export function ProfileEditor({
  curator,
  displayName,
  bio,
  nameChangedAt,
}: {
  curator: string;
  displayName: string | null;
  bio: string | null;
  nameChangedAt: string | null;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    undefined
  );
  const [nameState, nameAction, namePending] = useActionState<
    ProfileState,
    FormData
  >(renameUsername, undefined);

  // Rendered on the client, so "now" is the reader's clock. The database
  // enforces the same rule regardless of what this says.
  const now = new Date();
  const unlocked = canRename(nameChangedAt, now);
  const nextAt = nextRenameAt(nameChangedAt);

  return (
    <>
      {/* Its own form: a rename is a different action from saving the rest,
          and must not ride along with a bio edit. */}
      <form id="rename-form" action={nameAction} className="hidden" />
    <form action={action} className="flex w-full max-w-md flex-col items-start gap-4">
      <div className="w-full border-b border-white/10 pb-6">
        <label className="flex w-full flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-bone/70">
            Username
          </span>
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-[15px] text-bone/45">
              @
            </span>
            <input
              form="rename-form"
              id="profile-username"
              name="username"
              type="text"
              defaultValue={curator}
              maxLength={USERNAME_MAX}
              disabled={!unlocked}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-[3px] border border-white/15 bg-ink-2 px-3 py-2 text-[15px] text-bone focus:border-bone/60 focus:outline-none disabled:opacity-50"
            />
            <button
              form="rename-form"
              type="submit"
              disabled={!unlocked || namePending}
              className="flex-none rounded border border-white/25 px-3 py-2 text-sm disabled:opacity-50"
            >
              {namePending ? "Changing…" : "Change"}
            </button>
          </div>
        </label>
        <p className="mt-2 text-[11px] text-bone/50">
          {unlocked ? (
            <>
              How you&rsquo;re credited on every clip, and the address of your
              page. Changing it moves all of that and redirects your old
              links. Once every {RENAME_COOLDOWN_DAYS} days.
            </>
          ) : (
            <>
              Changed recently. You can change it again on{" "}
              {nextAt?.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              .
            </>
          )}
        </p>
        {nameState?.ok && !namePending && (
          <p className="mt-2 text-sm text-bone/70">Username changed.</p>
        )}
        {nameState?.error && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {nameState.error}
          </p>
        )}
      </div>

      <label className="flex w-full flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-bone/70">
          Display name
        </span>
        <input
          id="profile-display-name"
          name="display_name"
          type="text"
          defaultValue={displayName ?? ""}
          maxLength={DISPLAY_NAME_MAX}
          placeholder={curator}
          className="rounded-[3px] border border-white/15 bg-ink-2 px-3 py-2 text-[15px] text-bone placeholder:text-bone/40 focus:border-bone/60 focus:outline-none"
        />
        <span className="text-[11px] text-bone/50">
          Shown above your username on your page. Leave it blank and your
          username stands alone.
        </span>
      </label>

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
          {pending ? "Saving…" : "Save profile"}
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
    </>
  );
}
