"use client";

import { useActionState } from "react";
import { loginToClipper } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginToClipper, undefined);

  return (
    <form action={action} className="flex flex-col gap-3 w-full max-w-xs">
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
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
      <button
        disabled={pending}
        type="submit"
        className="border rounded px-3 py-2 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}
