"use client";

import { useActionState } from "react";
import { approveCurator, type TeamState } from "./actions";

const FIELD =
  "h-11 rounded-[3px] border border-white/15 bg-ink-2 px-3 text-[15px] text-bone placeholder:text-bone/40 focus:border-bone/60 focus:outline-none";

export function ApproveForm() {
  const [state, action, pending] = useActionState<TeamState, FormData>(approveCurator, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_220px_auto]">
        <input name="email" type="email" required placeholder="Their account email" className={FIELD} />
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-bone/45">@</span>
          <input name="username" required placeholder="username" className={`${FIELD} min-w-0 flex-1`} />
        </div>
        <button type="submit" disabled={pending} className="h-11 rounded-[3px] bg-bone px-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink disabled:opacity-60">
          {pending ? "Approving…" : "Approve"}
        </button>
      </div>
      <p className="text-[12px] text-bone/50">
        An existing username links their account to that curator page and its clips. A new
        one creates the page.
      </p>
      {state?.ok && <p className="text-sm text-bone">{state.ok}</p>}
      {state?.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
