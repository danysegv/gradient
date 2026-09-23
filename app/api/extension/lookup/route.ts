import { getBearerSession } from "@/lib/clip-session";
import { foundViaFromUrl } from "@/lib/clips/attribution";
import { isPublicWebUrl } from "@/lib/clips/clip-input";
import { json, preflight, readJsonObject } from "@/lib/extension/cors";
import { supabaseAdmin } from "@/lib/supabase/admin";

// What the extension's panel shows before anyone types: whether this image
// is already in the library, how many clips already came from this page,
// and where it was found — found_via is a FACT from the address
// (lib/clips/attribution.ts), never a guess, so the server answers it from
// the same list the classifier uses.

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  const session = await getBearerSession(request);
  if (!session) return json(request, { error: "Signed out." }, 401);

  const body = await readJsonObject(request);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const imageUrl = typeof body?.image_url === "string" ? body.image_url.trim() : "";
  if (!isPublicWebUrl(url)) return json(request, { error: "Bad request." }, 400);

  let existing: { id: string; clipped_by_name: string | null; clipped_at: string | null } | null = null;
  if (imageUrl && isPublicWebUrl(imageUrl)) {
    const { data } = await supabaseAdmin
      .from("clips")
      .select("id, clipped_by_name, clipped_at")
      .eq("image_url", imageUrl)
      .is("archived_at", null)
      .order("clipped_at", { ascending: true })
      .limit(1);
    existing = data?.[0] ?? null;
  }

  const { count } = await supabaseAdmin
    .from("clips")
    .select("id", { count: "exact", head: true })
    .eq("url", url)
    .is("archived_at", null);

  return json(request, {
    found_via: foundViaFromUrl(url),
    existing,
    from_this_page: count ?? 0,
  });
}
