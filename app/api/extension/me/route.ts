import { getBearerSession } from "@/lib/clip-session";
import { json, preflight } from "@/lib/extension/cors";

// Who the extension is signed in as. 401 means the token is stale (the
// extension refreshes and retries); a token that no longer belongs to a
// curator also reads 401, so an unlinked account is signed out.

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  const session = await getBearerSession(request);
  if (!session) return json(request, { error: "Signed out." }, 401);
  return json(request, { name: session.name, isAdmin: session.isAdmin });
}
