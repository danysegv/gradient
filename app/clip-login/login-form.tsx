"use client";

import { useActionState } from "react";
import { sendMagicLink } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, undefined);

  return (
    <form action={action} className="flex flex-col gap-3 w-full max-w-xs">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          className="border rounded px-3 py-2"
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.sent && (
        <p className="text-sm text-green-700">
          Check your inbox for a sign-in link.
        </p>
      )}
      <button
        disabled={pending}
        type="submit"
        className="border rounded px-3 py-2 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
