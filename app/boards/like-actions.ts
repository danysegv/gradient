"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionCurator } from "@/lib/clip-session";
import { isUuid } from "@/lib/boards/input";
import { LIKES_SLUG, LIKES_TITLE } from "@/lib/boards/likes";
import { setClipOnBoard } from "./actions";

export type LikeResult = { liked: boolean } | { error: string };

// Like or unlike a clip: put it on, or take it off, the curator's private
// "Likes" plate, making the plate the first time. The actual board write
// is setClipOnBoard, the same door every plate save goes through — it
// re-checks the session and ownership, and never touches clips or tags,
// so a like can't move a figure.
export async function setLike(clipId: string, like: boolean): Promise<LikeResult> {
  const curator = await getSessionCurator();
  if (!curator) return { error: "signin" };
  if (!isUuid(clipId)) return { error: "That clip link isn't valid." };

  let { data: board } = await supabaseAdmin
    .from("boards")
    .select("id")
    .eq("owner_name", curator)
    .eq("slug", LIKES_SLUG)
    .maybeSingle();

  if (!board) {
    if (!like) return { liked: false }; // nothing to take it off
    const { data: made, error } = await supabaseAdmin
      .from("boards")
      .upsert(
        { owner_name: curator, slug: LIKES_SLUG, title: LIKES_TITLE, is_public: false },
        { onConflict: "owner_name,slug", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();
    if (error) return { error: error.message };
    board = made;
    if (!board) {
      // A second tab made it between our read and write.
      ({ data: board } = await supabaseAdmin
        .from("boards")
        .select("id")
        .eq("owner_name", curator)
        .eq("slug", LIKES_SLUG)
        .maybeSingle());
    }
    if (!board) return { error: "Couldn't make your Likes plate." };
  }

  const res = await setClipOnBoard((board as { id: string }).id, clipId, like);
  if (res.error) return { error: res.error };
  return { liked: like };
}
