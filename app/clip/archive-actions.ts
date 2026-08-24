"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CLIP_SESSION_COOKIE, isValidSessionToken } from "@/lib/clip-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ArchiveActionResult = { error: string } | { error?: never };

async function requireSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CLIP_SESSION_COOKIE)?.value;
  return isValidSessionToken(token) ? "ok" : null;
}

// Soft delete — archived_at = now(). Service-role client only; there is
// deliberately no anon UPDATE/DELETE policy on clips, so this can't be
// reached any other way than through this gated action.
export async function archiveClip(clipId: string): Promise<ArchiveActionResult> {
  if (!(await requireSession())) {
    return { error: "Not authorized." };
  }

  const { error } = await supabaseAdmin
    .from("clips")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", clipId);

  if (error) return { error: error.message };

  revalidatePath("/clip");
  revalidatePath("/");
  return {};
}

// Reverses archiveClip. Reversible by design — this is what the undo
// affordance calls.
export async function unarchiveClip(clipId: string): Promise<ArchiveActionResult> {
  if (!(await requireSession())) {
    return { error: "Not authorized." };
  }

  const { error } = await supabaseAdmin
    .from("clips")
    .update({ archived_at: null })
    .eq("id", clipId);

  if (error) return { error: error.message };

  revalidatePath("/clip");
  revalidatePath("/");
  return {};
}
