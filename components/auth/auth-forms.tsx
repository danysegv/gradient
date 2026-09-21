"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  signUp,
  signIn,
  requestPasswordReset,
  updatePassword,
  type AuthState,
} from "@/app/auth/actions";
import { PASSWORD_MIN } from "@/lib/auth/password";

const FIELD =
  "h-14 w-full rounded-[4px] border border-white/20 bg-ink px-5 text-[16px] text-bone placeholder:text-bone/45 focus:border-bone/70 focus:outline-none";
const BUTTON =
  "h-14 w-full rounded-[4px] bg-bone px-8 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-white disabled:opacity-60";

function Message({ state }: { state: AuthState }) {
  if (!state) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={`text-center text-[14px] ${state.error ? "text-bone" : "text-bone/80"}`}
    >
      {state.error ?? state.notice}
    </p>
  );
}

function Email() {
  return (
    <>
      <label htmlFor="auth-email" className="sr-only">
        Email address
      </label>
      <input id="auth-email" name="email" type="email" required autoComplete="email" placeholder="Email address" className={FIELD} />
    </>
  );
}

function Password({ autoComplete, placeholder = "Password" }: { autoComplete: string; placeholder?: string }) {
  return (
    <>
      <label htmlFor="auth-password" className="sr-only">
        {placeholder}
      </label>
      <input
        id="auth-password"
        name="password"
        type="password"
        required
        minLength={autoComplete === "new-password" ? PASSWORD_MIN : undefined}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={FIELD}
      />
    </>
  );
}

// A new password, typed twice. The two fields check each other as you type
// (the browser won't submit a mismatch), and the server checks again.
function NewPassword({ placeholder }: { placeholder: string }) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const mismatch = second.length > 0 && second !== first;
  return (
    <>
      <label htmlFor="auth-password" className="sr-only">
        {placeholder}
      </label>
      <input
        id="auth-password"
        name="password"
        type="password"
        required
        minLength={PASSWORD_MIN}
        autoComplete="new-password"
        placeholder={placeholder}
        value={first}
        onChange={(e) => {
          setFirst(e.target.value);
          // Editing the first field can fix — or break — a match already typed.
          const confirm = e.target.form?.elements.namedItem("confirm_password");
          if (confirm instanceof HTMLInputElement) {
            confirm.setCustomValidity(
              confirm.value && confirm.value !== e.target.value ? "The passwords don't match." : ""
            );
          }
        }}
        className={FIELD}
      />
      <label htmlFor="auth-confirm" className="sr-only">
        Confirm password
      </label>
      <input
        id="auth-confirm"
        name="confirm_password"
        type="password"
        required
        autoComplete="new-password"
        placeholder="Confirm password"
        value={second}
        onChange={(e) => {
          setSecond(e.target.value);
          e.target.setCustomValidity(
            e.target.value && e.target.value !== first ? "The passwords don't match." : ""
          );
        }}
        aria-invalid={mismatch}
        aria-describedby={mismatch ? "auth-confirm-note" : undefined}
        className={`${FIELD} ${mismatch ? "border-bone/70" : ""}`}
      />
      {mismatch && (
        <p id="auth-confirm-note" className="px-1 text-left text-[13px] text-bone/80">
          The passwords don&rsquo;t match.
        </p>
      )}
    </>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, undefined);
  if (state?.notice) {
    return (
      <div className="text-center">
        <p className="text-[18px] font-semibold">Check your inbox.</p>
        <p className="mt-2 text-[15px] text-bone/70">{state.notice}</p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <Email />
      <NewPassword placeholder={`Password (${PASSWORD_MIN}+ characters)`} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Creating…" : "Sign up"}
      </button>
      <div className="mt-2">
        <Message state={state} />
      </div>
    </form>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="next" value={next} />
      <Email />
      <Password autoComplete="current-password" />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <Link href="/forgot-password" className="mt-3 text-center text-[13px] text-bone/55 underline-offset-4 hover:text-bone hover:underline">
        Forgot your password?
      </Link>
      <div className="mt-2">
        <Message state={state} />
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);
  if (state?.notice) {
    return <p className="text-center text-[15px] text-bone/80">{state.notice}</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <Email />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <div className="mt-2">
        <Message state={state} />
      </div>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <NewPassword placeholder={`New password (${PASSWORD_MIN}+ characters)`} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Saving…" : "Set password"}
      </button>
      <div className="mt-2">
        <Message state={state} />
      </div>
    </form>
  );
}
