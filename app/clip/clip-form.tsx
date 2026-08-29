"use client";

import { useActionState, useEffect, useRef } from "react";
import { createClip } from "./actions";

export function ClipForm() {
  const [state, action, pending] = useActionState(createClip, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-col gap-3 max-w-md"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="url" className="text-sm">
          URL *
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://..."
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="image_url" className="text-sm">
          Image URL
        </label>
        <input
          id="image_url"
          name="image_url"
          type="url"
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          className="border rounded px-3 py-2"
        />
      </div>

      {/* Attribution, split four ways as of 2026-08-29.
          This was one "Source" field with the placeholder
          "Behance, Dribbble, Instagram…", which invited a discovery
          platform — and creators, publishers and finders all ended up in
          the same box, comma-separated. 79 source strings had to be
          untangled by hand as a result, and a credit line built from that
          field would have credited Designspiration for Pierre Mendell's
          poster. Four fields that cannot be confused for each other. */}
      <div className="flex flex-col gap-1">
        <label htmlFor="creator" className="text-sm">
          Creator <span className="opacity-60">— who made it</span>
        </label>
        <input
          id="creator"
          name="creator"
          type="text"
          placeholder="Photographer, designer, art director, studio"
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="rights_holder" className="text-sm">
          Rights holder <span className="opacity-60">— who published or owns it</span>
        </label>
        <input
          id="rights_holder"
          name="rights_holder"
          type="text"
          placeholder="Brand, publisher, magazine, museum, agency"
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="found_via" className="text-sm">
          Found via <span className="opacity-60">— never a credit</span>
        </label>
        <input
          id="found_via"
          name="found_via"
          type="text"
          placeholder="Designspiration, PICDIT, Fonts in Use, Instagram…"
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="source_year" className="text-sm">
          Work year <span className="opacity-60">— when it was MADE, not clipped</span>
        </label>
        <input
          id="source_year"
          name="source_year"
          type="number"
          inputMode="numeric"
          min={1400}
          max={new Date().getFullYear() + 1}
          placeholder="1976"
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="caption" className="text-sm">
          Caption
        </label>
        <textarea
          id="caption"
          name="caption"
          rows={3}
          className="border rounded px-3 py-2"
        />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-sm text-green-700">Saved.</p>}

      <button
        disabled={pending}
        type="submit"
        className="border rounded px-3 py-2 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save clip"}
      </button>
    </form>
  );
}
