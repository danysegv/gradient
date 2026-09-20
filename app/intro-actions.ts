"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ENTERED_COOKIE } from "@/lib/intro";

// UI-only sign-up (2026-09-19): the email field is validated in the browser
// and then deliberately ignored — nothing is stored, logged or sent. All
// this does is remember that the visitor has been through the intro, so
// `/` shows them the library from now on.
export async function enterLibrary() {
  (await cookies()).set(ENTERED_COOKIE, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  redirect("/");
}
