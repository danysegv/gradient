import "server-only";
import { supabasePublic } from "@/lib/supabase/public";

// Thoughts on a clip (stored as clip_notes): short, public, signed with the
// curator's username. One level of replies: a reply's parent_id is a
// top-level thought, never another reply.
// Read with the public client — the table's only policy is "anyone reads".
// Writes go through app/clip/note-actions.ts.

export const NOTE_MAX = 500;

export type ClipNote = {
  id: string;
  parent_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

export async function getNotes(clipId: string): Promise<ClipNote[]> {
  const { data, error } = await supabasePublic
    .from("clip_notes")
    .select("id, parent_id, author_name, body, created_at")
    .eq("clip_id", clipId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return [];
  return (data ?? []) as ClipNote[];
}
