"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type RequestState =
  | { error: string; success?: never }
  | { error?: never; success: true }
  | undefined;

function text(formData: FormData, key: string, max: number): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// Deliberately permissive: the point is to catch a typo, not to police
// what a valid address looks like. The real filter is the questions.
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf("@");
  return at > 0 && at < value.length - 1 && !/\s/.test(value);
}

export async function requestInvitation(
  _prev: RequestState,
  formData: FormData
): Promise<RequestState> {
  const name = text(formData, "name", 120);
  // Lowercased at the boundary: the unique constraint is on the plain
  // column so ON CONFLICT can name it, and a CHECK enforces the casing.
  const email = text(formData, "email", 320)?.toLowerCase() ?? null;

  if (!name) return { error: "A name, so we know who is asking." };
  if (!email || !looksLikeEmail(email)) {
    return { error: "That email doesn't look right — check it over?" };
  }

  // A honeypot: a real person never fills a field they cannot see. Cheap,
  // and it keeps the table clean without putting a CAPTCHA in front of an
  // art director.
  if (text(formData, "website", 200)) {
    // Answer as though it worked. A bot that learns it was caught adapts.
    return { success: true };
  }

  // Writes go through the service-role key, like clips. invitation_requests
  // has NO anon policies at all, so this table can never be read or written
  // from a browser — it holds email addresses.
  const { error } = await supabaseAdmin.from("invitation_requests").upsert(
    {
      name,
      email,
      role: text(formData, "role", 120),
      studio: text(formData, "studio", 160),
      portfolio_url: text(formData, "portfolio_url", 500),
      vouched_by: text(formData, "vouched_by", 160),
      would_clip: text(formData, "would_clip", 1000),
    },
    { onConflict: "email" }
  );

  if (error) {
    // Never surface a raw Postgres message to a stranger.
    console.error(`[invitation] insert failed: ${error.message}`);
    return { error: "Something went wrong saving that. Try again shortly?" };
  }

  return { success: true };
}
