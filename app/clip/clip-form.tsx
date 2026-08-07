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

      <div className="flex flex-col gap-1">
        <label htmlFor="source" className="text-sm">
          Source
        </label>
        <input
          id="source"
          name="source"
          type="text"
          placeholder="Behance, Dribbble, Instagram…"
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
