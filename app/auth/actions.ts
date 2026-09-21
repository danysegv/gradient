"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authServerClient } from "@/lib/supabase/auth-server";
import { parseEmail } from "@/lib/auth/email";

// Sign-up and sign-in are the same thing here: enter an email, get a link.
// A new address gets an account; a known one gets signed back in. No
// password is ever stored.

export type SignInState =
  | { sent: true; email: string; error?: never }
  | { error: string; sent?: never }
  | undefined;

export async function requestSignInLink(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = parseEmail(formData.get("email"));
  if (!parsed.ok) return { error: parsed.error };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const supabase = await authServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.value,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    // Supabase's built-in mailer allows only a few messages an hour; say
    // so plainly rather than showing its error code.
    if (error.status === 429 || /rate/i.test(error.message)) {
      return { error: "Too many sign-in emails just now. Try again in a few minutes." };
    }
    return { error: "We couldn't send the link. Check the address and try again." };
  }
  return { sent: true, email: parsed.value };
}

export async function signOut() {
  const supabase = await authServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
