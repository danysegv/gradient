"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  CLIP_SESSION_COOKIE,
  expectedSessionToken,
  resolveCurator,
} from "@/lib/clip-auth";
import { allowAttempt, requestIp, rulesFor } from "@/lib/auth/attempts";
import { TOO_MANY } from "@/lib/auth/attempt-rules";

export type LoginState = { error: string } | undefined;

export async function loginToClipper(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  // The old shared password had no limit at all (security review
  // 2026-10-13, #3). Counted before the comparison, right or wrong.
  if (!(await allowAttempt(rulesFor(await requestIp(), "curatorPasswordPerIp")))) {
    return { error: TOO_MANY };
  }

  const password = formData.get("password");
  const curatorName =
    typeof password === "string" ? resolveCurator(password) : null;

  if (!curatorName) {
    return { error: "Wrong password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(CLIP_SESSION_COOKIE, expectedSessionToken(curatorName), {
    httpOnly: true,
    // Safari refuses to store a Secure cookie on http://localhost — Chrome
    // and Firefox special-case localhost as a trustworthy origin, Safari
    // does not. Left as `true` this makes a *correct* password look like a
    // silent login loop in local dev, which is indistinguishable from a
    // wrong one. Production is unaffected: NODE_ENV is "production" there,
    // so the cookie stays Secure on the deployed site.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/clip");
}
