"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  CLIP_SESSION_COOKIE,
  expectedSessionToken,
  isValidPassword,
} from "@/lib/clip-auth";

export type LoginState = { error: string } | undefined;

export async function loginToClipper(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const password = formData.get("password");

  if (typeof password !== "string" || !isValidPassword(password)) {
    return { error: "Wrong password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(CLIP_SESSION_COOKIE, expectedSessionToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/clip");
}
