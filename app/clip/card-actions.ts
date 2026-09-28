"use server";

import { cookies } from "next/headers";
import { getSession } from "@/lib/clip-session";
import { CLIPPER_CARD_COOKIE, cardKey } from "@/lib/clipper-card";

/** "Hide this" on the clipper card: until this sign-in ends (lib/clipper-card.ts). */
export async function hideClipperCard(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  (await cookies()).set(CLIPPER_CARD_COOKIE, cardKey(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
