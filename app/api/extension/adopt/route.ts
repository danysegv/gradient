import { cookies } from "next/headers";
import { getBearerSession } from "@/lib/clip-session";
import { mintSession, sessionIdOfMinted } from "@/lib/auth/mint-session";
import { pairSessions } from "@/lib/auth/session-pairs";
import { setRemember } from "@/lib/auth/remember-cookie";
import { authServerClient } from "@/lib/supabase/auth-server";
import { isSiteBridgeCall, json, readJsonObject } from "@/lib/extension/cors";
import { ENTERED_COOKIE } from "@/lib/intro";

// The site picking up the extension's sign-in (2026-09-27): signed in on
// the extension, you open 04AM and are signed in there too. Called by
// extension/site.js on a 04AM page with the extension's token; sets the
// site's own cookies for a NEW session, paired with the extension's.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSiteBridgeCall(request)) return json(request, { error: "Bad request." }, 400);
  const ext = await getBearerSession(request);
  if (!ext?.userId || !ext.sessionId) return json(request, { error: "Signed out." }, 401);

  const body = await readJsonObject(request);
  const remember = body?.remember !== false;

  const minted = await mintSession(ext.userId);
  const siteId = minted ? sessionIdOfMinted(minted.access_token) : null;
  if (!minted || !siteId) return json(request, { error: "Something went wrong. Try again." }, 502);

  await setRemember(remember);
  const supabase = await authServerClient({ sessionOnly: !remember });
  const { error } = await supabase.auth.setSession({
    access_token: minted.access_token,
    refresh_token: minted.refresh_token,
  });
  if (error) return json(request, { error: "Something went wrong. Try again." }, 502);
  (await cookies()).set(ENTERED_COOKIE, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });

  await pairSessions(siteId, ext.sessionId, ext.userId);
  return json(request, { ok: true, name: ext.name });
}
