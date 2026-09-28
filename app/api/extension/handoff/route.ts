import { getSession } from "@/lib/clip-session";
import { handoffToExtension } from "@/lib/auth/extension-session";
import { isRemembered } from "@/lib/auth/remember-cookie";
import { isSiteBridgeCall, json } from "@/lib/extension/cors";

// The extension picking up the site's sign-in (2026-09-27), so a curator
// signs in once. Called by extension/site.js on a 04AM page, with the
// site's cookies; answers with a NEW session for the extension, paired
// with the site's so signing out of either ends both.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSiteBridgeCall(request)) return json(request, { error: "Bad request." }, 400);
  const site = await getSession();
  if (!site) return json(request, { error: "Signed out." }, 401);
  const result = await handoffToExtension(site);
  return result.ok
    ? json(request, { ...result.session, remember: await isRemembered() })
    : json(request, { error: result.error, code: result.code }, result.status);
}
