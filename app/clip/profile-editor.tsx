"use client";

import { useActionState, useRef, useState } from "react";
import { updateProfile, removeAvatar, type ProfileState } from "./profile-actions";
import { Avatar } from "@/components/avatar";
import { DISPLAY_NAME_MAX, BIO_MAX } from "@/lib/profiles/input";

// The curator's own profile, edited from the one page they sign in to.
// Everything here shows on their public curator page and the roster, which
// is worth saying on the form rather than letting someone discover it.
export function ProfileEditor({
  curator,
  displayName,
  bio,
  avatarUrl,
}: {
  curator: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    undefined
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shown = preview ?? avatarUrl;

  return (
    <form action={action} className="flex flex-col items-start gap-4">
      <div className="flex items-start gap-4">
        <Avatar name={curator} displayName={displayName} src={shown} size={72} />
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer rounded border border-white/25 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-bone/85 hover:border-white/45 hover:text-bone">
            {shown ? "Replace picture" : "Add a picture"}
            <input
              ref={fileRef}
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </label>
          {avatarUrl && !preview && (
            <button
              type="button"
              disabled={removing}
              onClick={async () => {
                setRemoving(true);
                setRemoveError(null);
                const result = await removeAvatar();
                if (result?.error) setRemoveError(result.error);
                setRemoving(false);
              }}
              className="text-left text-[11px] font-semibold uppercase tracking-wide text-bone/60 underline underline-offset-4 hover:text-bone disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          )}
          <p className="max-w-[26ch] text-[11px] leading-snug text-bone/55">
            Square works best — it&rsquo;s shown as a tile and will be cropped
            to fit.
          </p>
        </div>
      </div>

      <label className="flex w-full max-w-md flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-bone/70">
          Display name
        </span>
        <input
          name="display_name"
          defaultValue={displayName ?? ""}
          maxLength={DISPLAY_NAME_MAX}
          placeholder={curator}
          autoComplete="off"
          className="rounded-[3px] border border-white/15 bg-ink-2 px-3 py-2 text-[15px] text-bone placeholder:text-bone/40 focus:border-bone/60 focus:outline-none"
        />
        <span className="text-[11px] text-bone/50">
          Leave blank to keep showing {curator}.
        </span>
      </label>

      <label className="flex w-full max-w-md flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-bone/70">
          Bio
        </span>
        <textarea
          name="bio"
          defaultValue={bio ?? ""}
          maxLength={BIO_MAX}
          rows={3}
          placeholder="What you look for, in a line or two."
          className="resize-y rounded-[3px] border border-white/15 bg-ink-2 px-3 py-2 text-[15px] leading-relaxed text-bone placeholder:text-bone/40 focus:border-bone/60 focus:outline-none"
        />
        <span className="text-[11px] text-bone/50">
          Up to {BIO_MAX} characters. Shown on your curator page.
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

      {(state?.error || removeError) && (
        <p role="alert" className="max-w-md text-sm text-red-400">
          {state?.error ?? removeError}
        </p>
      )}
      <p className="max-w-md text-xs text-bone/55">
        This is public: it shows on your curator page and in the curators
        roster.
      </p>
    </form>
  );
}
