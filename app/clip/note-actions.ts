"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSession } from "@/lib/clip-session";
import { isUuid } from "@/lib/boards/input";

export type NoteResult = { ok: true } | { error: string };

const MAX = 500;

// A note is signed with the curator's current username, so only a curator
// can leave one — a visitor account has an email and no public name.
export async function addNote(
  clipId: string,
  body: string,
  parentId: string | null = null
): Promise<NoteResult> {
  const session = await getSession();
  if (!session) return { error: "signin" };
  if (!isUuid(clipId)) return { error: "That clip link isn't valid." };
  const text = body.replace(/\s+\n/g, "\n").trim();
  if (text.length === 0) return { error: "Write something first." };
  if (text.length > MAX) return { error: `Keep it under ${MAX} characters.` };

  // A reply answers a top-level thought on the same clip — one level deep,
  // so the column stays a conversation and never a tree.
  if (parentId !== null) {
    if (!isUuid(parentId)) return { error: "That thought isn't there any more." };
    const { data: parent } = await supabaseAdmin
      .from("clip_notes")
      .select("clip_id, parent_id")
      .eq("id", parentId)
      .maybeSingle();
    const p = parent as { clip_id: string; parent_id: string | null } | null;
    if (!p || p.clip_id !== clipId) return { error: "That thought isn't there any more." };
    if (p.parent_id !== null) parentId = p.parent_id; // replying to a reply joins its thread
  }

  const { error } = await supabaseAdmin
    .from("clip_notes")
    .insert({ clip_id: clipId, author_name: session.name, body: text, parent_id: parentId });
  if (error) return { error: error.message };
  revalidatePath(`/clip/${clipId}`);
  return { ok: true };
}

// Removed by whoever wrote it, by the curator who clipped the reference,
// or by an admin. Checked here: the table has no write policy at all.
export async function deleteNote(noteId: string): Promise<NoteResult> {
  const session = await getSession();
  if (!session) return { error: "signin" };
  if (!isUuid(noteId)) return { error: "Not found." };

  const { data } = await supabaseAdmin
    .from("clip_notes")
    .select("id, author_name, clip_id, clips ( clipped_by_name )")
    .eq("id", noteId)
    .maybeSingle();
  const note = data as unknown as {
    author_name: string;
    clip_id: string;
    clips: { clipped_by_name: string | null } | null;
  } | null;
  if (!note) return { error: "Not found." };
  const allowed =
    note.author_name === session.name ||
    note.clips?.clipped_by_name === session.name ||
    session.isAdmin;
  if (!allowed) return { error: "Only its author or the clip's curator can remove a thought." };

  const { error } = await supabaseAdmin.from("clip_notes").delete().eq("id", noteId);
  if (error) return { error: error.message };
  revalidatePath(`/clip/${note.clip_id}`);
  return { ok: true };
}
