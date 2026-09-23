import { revalidatePath } from "next/cache";
import { getBearerSession } from "@/lib/clip-session";
import { parseClipInput } from "@/lib/clips/clip-input";
import { insertClip } from "@/lib/clips/create";
import { json, preflight, readJsonObject } from "@/lib/extension/cors";

// The browser extension's door for a new clip. Same validation and the
// same insert as the /clip form (app/clip/actions.ts): parseClipInput,
// then insertClip. Classification and description run after the response,
// exactly as they do for a pasted URL.

export const dynamic = "force-dynamic";

// Classification runs in after() — give it the same room as /clip.
export const maxDuration = 300;

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  // Current username, never the login key: this is the credit the clip
  // carries in public.
  const session = await getBearerSession(request);
  if (!session) return json(request, { error: "Signed out." }, 401);

  const body = await readJsonObject(request);
  if (!body) return json(request, { error: "Bad request." }, 400);

  const parsed = parseClipInput((key) => body[key]);
  if (!parsed.ok) return json(request, { error: parsed.error }, 400);

  const saved = await insertClip(parsed.value, session.name);
  if (!saved.ok) return json(request, { error: saved.error }, 500);

  revalidatePath("/clip");
  const origin = new URL(request.url).origin;
  return json(request, { id: saved.clip.id, href: `${origin}/clip/${saved.clip.id}` }, 201);
}
