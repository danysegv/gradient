"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authServerClient } from "@/lib/supabase/auth-server";
import { parseEmail } from "@/lib/auth/email";
import { parseNewPassword } from "@/lib/auth/password";
import { safeNext } from "@/lib/auth/next";
import { ENTERED_COOKIE } from "@/lib/intro";

// Accounts (2026-09-21): email + password through Supabase Auth, for
// everyone. A curator is an account an admin has linked to a curator
// profile (see /clip/team); nothing here grants that. No password ever
// touches this app's own tables — Supabase stores it, hashed.

export type AuthState =
  | { error: string; notice?: never }
  | { notice: string; error?: never }
  | undefined;

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function markEntered() {
  (await cookies()).set(ENTERED_COOKIE, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
}

function friendly(err: { message: string; status?: number; code?: string }): string {
  if (err.status === 429 || /rate/i.test(err.message)) {
    return "Too many attempts just now. Try again in a few minutes.";
  }
  if (err.code === "email_not_confirmed" || /not confirmed/i.test(err.message)) {
    return "Confirm your email first — the link is in your inbox.";
  }
  if (err.code === "invalid_credentials" || /invalid login/i.test(err.message)) {
    return "That email and password don't match.";
  }
  if (err.code === "user_already_exists" || /already registered/i.test(err.message)) {
    return "There's already an account with that email. Sign in instead.";
  }
  if (err.code === "weak_password") {
    return "Choose a stronger password.";
  }
  return "Something went wrong. Try again.";
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = parseEmail(formData.get("email"));
  if (!email.ok) return { error: email.error };
  const password = parseNewPassword(
    formData.get("password"),
    formData.get("confirm_password")
  );
  if (!password.ok) return { error: password.error };

  const supabase = await authServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
    options: { emailRedirectTo: `${await origin()}/auth/callback` },
  });
  if (error) return { error: friendly(error) };

  // Supabase answers an already-registered address with a user that has no
  // identities, deliberately, so the form can't be used to probe who has
  // an account. Say the same thing either way.
  if (data.session) {
    await markEntered();
    redirect("/");
  }
  return {
    notice: `Check ${email.value} — open the link to confirm your account.`,
  };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = parseEmail(formData.get("email"));
  if (!email.ok) return { error: email.error };
  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return { error: "Enter your password." };
  }

  const supabase = await authServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password,
  });
  if (error) return { error: friendly(error) };

  await markEntered();
  redirect(safeNext(formData.get("next")));
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = parseEmail(formData.get("email"));
  if (!email.ok) return { error: email.error };

  const supabase = await authServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: `${await origin()}/auth/callback?next=/reset-password`,
  });
  if (error && (error.status === 429 || /rate/i.test(error.message))) {
    return { error: friendly(error) };
  }
  // Same answer whether or not the address has an account.
  return { notice: `If ${email.value} has an account, a reset link is on its way.` };
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = parseNewPassword(
    formData.get("password"),
    formData.get("confirm_password")
  );
  if (!password.ok) return { error: password.error };

  const supabase = await authServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return { error: "That reset link has expired. Ask for a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password: password.value });
  if (error) return { error: friendly(error) };

  await markEntered();
  redirect("/");
}

export async function signOut() {
  const supabase = await authServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
