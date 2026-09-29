"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/clip-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canEditCaption, parseCaption } from "@/lib/clips/caption";

export type CaptionResult = { ok: true; caption: string | null } | { ok: false; error: string };

// The only door that changes a caption. Who may is decided here from the
// session and the stored clip, never from anything the form sends.
// Touches the caption column and nothing else: no tag, share or figure
// reads it, so editing it moves no number.
export async function updateCaption(clipId: string, raw: unknown): Promise<CaptionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to edit." };

  const parsed = parseCaption(raw);
  if (!parsed.ok) return parsed;

  const { data: clip, error: readErr } = await supabaseAdmin
    .from("clips")
    .select("id, clipped_by_name")
    .eq("id", clipId)
    .maybeSingle();
  if (readErr) return { ok: false, error: "Couldn't load that clip." };
  if (!clip || !canEditCaption(session, clip.clipped_by_name as string | null)) {
    return { ok: false, error: "Only the curator who clipped this can edit its caption." };
  }

  const { error } = await supabaseAdmin.from("clips").update({ caption: parsed.value }).eq("id", clipId);
  if (error) return { ok: false, error: "Couldn't save. Try again." };

  revalidatePath(`/clip/${clipId}`);
  revalidatePath("/clip");
  return { ok: true, caption: parsed.value };
}
