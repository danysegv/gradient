"use server";

import { revalidatePath } from "next/cache";
import { getSessionCurator } from "@/lib/clip-session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ArchiveActionResult = { error: string } | { error?: never };

async function requireSession(): Promise<string | null> {
  return getSessionCurator();
}

// Soft delete — archived_at = now(). Service-role client only; there is
// deliberately no anon UPDATE/DELETE policy on clips, so this can't be
// reached any other way than through this gated action.
export async function archiveClip(clipId: string): Promise<ArchiveActionResult> {
  const curatorName = await requireSession();
  if (!curatorName) {
    return { error: "Not authorized." };
  }

  const { error } = await supabaseAdmin
    .from("clips")
    .update({ archived_at: new Date().toISOString(), archived_by_name: curatorName })
    .eq("id", clipId);

  if (error) return { error: error.message };

  revalidatePath("/clip");
  revalidatePath("/");
  return {};
}

// Reverses archiveClip. Reversible by design — this is what the undo
// affordance calls. Clears archived_by_name alongside archived_at: the
// column only means something paired with an active archive, so a
// restored clip shouldn't carry a stale archiver name.
export async function unarchiveClip(clipId: string): Promise<ArchiveActionResult> {
  const curatorName = await requireSession();
  if (!curatorName) {
    return { error: "Not authorized." };
  }

  const { error } = await supabaseAdmin
    .from("clips")
    .update({ archived_at: null, archived_by_name: null })
    .eq("id", clipId);

  if (error) return { error: error.message };

  revalidatePath("/clip");
  revalidatePath("/");
  return {};
}

// Permanent delete, offered only in the Archived view (Daniela,
// 2026-09-25). Three conditions, all enforced here and not just by the UI:
// a signed-in curator, a clip they clipped themselves, and a clip that is
// already archived — so nothing live, and nobody else's work, can be
// deleted from this door. Everything hanging off the clip (tags, colours,
// description, plate entries, classification history) goes with it by
// ON DELETE CASCADE; api_spend keeps its rows with clip_id set to null,
// so what was spent stays on the books. Archived clips already sit
// outside every figure, so no count or velocity moves.
export async function deleteClipPermanently(clipId: string): Promise<ArchiveActionResult> {
  const curatorName = await requireSession();
  if (!curatorName) {
    return { error: "Not authorized." };
  }

  const { data, error } = await supabaseAdmin
    .from("clips")
    .delete()
    .eq("id", clipId)
    .eq("clipped_by_name", curatorName)
    .not("archived_at", "is", null)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Only your own archived clips can be deleted." };
  }

  revalidatePath("/clip");
  return {};
}
