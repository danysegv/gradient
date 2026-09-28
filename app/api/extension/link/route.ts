import { getSession } from "@/lib/clip-session";
import { json } from "@/lib/extension/cors";
import { isRemembered } from "@/lib/auth/remember-cookie";
import { getVisitorEmail } from "@/lib/supabase/auth-server";

// Who the SITE is signed in as, asked by the extension's script on a 04AM
// page (extension/site.js) with the site's own cookies. The extension
// compares it with its own sign-in and either picks the site's up, hands
// its own over, or signs out because the site did. Same-origin only: no
// CORS headers are sent to web pages, so another site can't read this.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  const curator =
    session?.via === "account" && session.userId
      ? { userId: session.userId, name: session.name }
      : null;
  // Signed in as a visitor who isn't a curator: the extension leaves the
  // site alone rather than swapping in a curator's sign-in.
  const signedIn = curator !== null || (await getVisitorEmail()) !== null;
  return json(request, { signedIn, curator, remember: await isRemembered() });
}
