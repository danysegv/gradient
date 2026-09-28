import "server-only";
import { cookies } from "next/headers";
import { SESSION_ONLY_COOKIE } from "@/lib/auth/remember";

/** Sets or clears the "Remember me" marker (lib/auth/remember.ts). Not
 * httpOnly: the browser client has to honour it when it refreshes. */
export async function setRemember(remember: boolean): Promise<void> {
  const store = await cookies();
  if (remember) {
    store.delete(SESSION_ONLY_COOKIE);
  } else {
    store.set(SESSION_ONLY_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
}

/** Whether this browser's sign-in is remembered. */
export async function isRemembered(): Promise<boolean> {
  return (await cookies()).get(SESSION_ONLY_COOKIE)?.value !== "1";
}
