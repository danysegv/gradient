"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { error: string; sent?: never }
  | { error?: never; sent: true }
  | undefined;

export async function sendMagicLink(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get("email");

  if (typeof email !== "string" || !email.trim()) {
    return { error: "Enter your email address." };
  }

  const origin = (await headers()).get("origin");
  if (!origin) {
    return { error: "Could not determine this app's address. Try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: new URL("/auth/callback", origin).toString(),
      // This is an internal tool. Only accounts created in Supabase Auth can
      // receive a link; a submitted email must never create a new account.
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Keep this generic: Supabase intentionally does not reveal whether an
    // account exists for a submitted address.
    return { error: "Could not send a sign-in link. Check the email and try again." };
  }

  return { sent: true };
}
