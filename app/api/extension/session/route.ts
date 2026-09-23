import { parseEmail } from "@/lib/auth/email";
import { refreshExtension, signInExtension, signOutExtension } from "@/lib/auth/extension-session";
import { bearerToken } from "@/lib/clip-session";
import { json, preflight, readJsonObject } from "@/lib/extension/cors";

// The browser extension's sign-in. POST { email, password } signs in;
// POST { refresh_token } renews; DELETE (with the bearer token) signs out.
// Only curators get a session back — see lib/auth/extension-session.ts.

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return json(request, { error: "Bad request." }, 400);

  if (typeof body.refresh_token === "string" && body.refresh_token) {
    const result = await refreshExtension(body.refresh_token);
    return result.ok
      ? json(request, result.session)
      : json(request, { error: result.error, code: result.code }, result.status);
  }

  const email = parseEmail(body.email);
  if (!email.ok) return json(request, { error: email.error, code: "invalid" }, 400);
  const password = body.password;
  if (typeof password !== "string" || password.length === 0 || password.length > 200) {
    return json(request, { error: "Enter your password.", code: "invalid" }, 400);
  }

  const result = await signInExtension(email.value, password);
  return result.ok
    ? json(request, result.session)
    : json(request, { error: result.error, code: result.code }, result.status);
}

export async function DELETE(request: Request) {
  const token = bearerToken(request);
  if (token) await signOutExtension(token);
  return json(request, { ok: true });
}
