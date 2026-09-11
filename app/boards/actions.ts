"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionCurator } from "@/lib/clip-session";
import { isUuid, parseBoardInput } from "@/lib/boards/input";
import { uniqueSlug } from "@/lib/boards/slug";

// Every board write. Server actions are reachable by direct POST, so each
// one re-verifies the /clip session AND that the signed-in curator owns
// the board — a valid session is not permission to edit someone else's.
//
// None of these touch clips or clip_tags (lib/boards/boards.test.ts
// asserts it). A board points at clips; it never creates a reference.

export type BoardFormState =
  | { error: string; ok?: never }
  | { ok: true; error?: never; slug: string; boardId: string }
  | undefined;

export type BoardActionResult = { error: string } | { error?: never };

const NOT_SIGNED_IN = "Sign in at /clip-login to make and edit boards.";

function profilePath(owner: string) {
  return `/curator/${encodeURIComponent(owner)}`;
}
function boardPath(owner: string, slug: string) {
  return `${profilePath(owner)}/boards/${encodeURIComponent(slug)}`;
}

async function ownedBoard(boardId: unknown, curator: string) {
  if (!isUuid(boardId)) return null;
  const { data } = await supabaseAdmin
    .from("boards")
    .select("id, slug, owner_name")
    .eq("id", boardId)
    .maybeSingle();
  const row = data as { id: string; slug: string; owner_name: string } | null;
  return row && row.owner_name === curator ? row : null;
}

export async function createBoard(
  _prev: BoardFormState,
  formData: FormData
): Promise<BoardFormState> {
  const curator = await getSessionCurator();
  if (!curator) return { error: NOT_SIGNED_IN };

  const parsed = parseBoardInput(formData);
  if ("error" in parsed) return { error: parsed.error };

  const rawClipId = formData.get("clip_id");
  const clipId = rawClipId === null || rawClipId === "" ? null : rawClipId;
  if (clipId !== null && !isUuid(clipId)) {
    return { error: "That clip link isn't valid." };
  }

  // A curator configured after the profiles seed has no row yet, and the
  // board's owner_name is a foreign key to it.
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({ name: curator }, { onConflict: "name", ignoreDuplicates: true });
  if (profileError) return { error: profileError.message };

  // Two attempts: the slug is computed from what exists, so a board with
  // the same title created in the same instant can collide on the unique
  // (owner_name, slug) constraint. The second read sees it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: existing } = await supabaseAdmin
      .from("boards")
      .select("slug")
      .eq("owner_name", curator);
    const slug = uniqueSlug(
      parsed.value.title,
      ((existing ?? []) as { slug: string }[]).map((r) => r.slug)
    );

    const { data, error } = await supabaseAdmin
      .from("boards")
      .insert({
        owner_name: curator,
        slug,
        title: parsed.value.title,
        description: parsed.value.description,
        is_public: parsed.value.isPublic,
      })
      .select("id, slug")
      .single();

    if (error?.code === "23505") continue;
    if (error || !data) {
      return { error: error?.message ?? "The board couldn't be created." };
    }
    const board = data as { id: string; slug: string };

    if (clipId) {
      const { error: linkError } = await supabaseAdmin
        .from("board_clips")
        .insert({ board_id: board.id, clip_id: clipId });
      if (linkError) return { error: linkError.message };
      revalidatePath(`/clip/${clipId}`);
    }

    revalidatePath(profilePath(curator));
    return { ok: true, slug: board.slug, boardId: board.id };
  }
  return { error: "A board with that title was just created. Try again." };
}

export async function updateBoard(
  _prev: BoardFormState,
  formData: FormData
): Promise<BoardFormState> {
  const curator = await getSessionCurator();
  if (!curator) return { error: NOT_SIGNED_IN };

  const board = await ownedBoard(formData.get("board_id"), curator);
  if (!board) return { error: "You can only edit your own boards." };

  const parsed = parseBoardInput(formData);
  if ("error" in parsed) return { error: parsed.error };

  // The slug is left alone on rename, so saved links keep working.
  const { error } = await supabaseAdmin
    .from("boards")
    .update({
      title: parsed.value.title,
      description: parsed.value.description,
      is_public: parsed.value.isPublic,
      updated_at: new Date().toISOString(),
    })
    .eq("id", board.id);
  if (error) return { error: error.message };

  revalidatePath(profilePath(curator));
  revalidatePath(boardPath(curator, board.slug));
  return { ok: true, slug: board.slug, boardId: board.id };
}

export async function deleteBoard(boardId: string): Promise<BoardActionResult> {
  const curator = await getSessionCurator();
  if (!curator) return { error: NOT_SIGNED_IN };

  const board = await ownedBoard(boardId, curator);
  if (!board) return { error: "You can only delete your own boards." };

  // board_clips rows cascade. The clips themselves are untouched.
  const { error } = await supabaseAdmin.from("boards").delete().eq("id", board.id);
  if (error) return { error: error.message };

  revalidatePath(profilePath(curator));
  redirect(profilePath(curator));
}

export async function setClipOnBoard(
  boardId: string,
  clipId: string,
  on: boolean
): Promise<BoardActionResult> {
  const curator = await getSessionCurator();
  if (!curator) return { error: NOT_SIGNED_IN };
  if (!isUuid(clipId)) return { error: "That clip link isn't valid." };

  const board = await ownedBoard(boardId, curator);
  if (!board) return { error: "You can only change your own boards." };

  const { error } = on
    ? await supabaseAdmin
        .from("board_clips")
        .upsert(
          { board_id: board.id, clip_id: clipId },
          { onConflict: "board_id,clip_id", ignoreDuplicates: true }
        )
    : await supabaseAdmin
        .from("board_clips")
        .delete()
        .eq("board_id", board.id)
        .eq("clip_id", clipId);
  if (error) return { error: error.message };

  await supabaseAdmin
    .from("boards")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", board.id);

  revalidatePath(`/clip/${clipId}`);
  revalidatePath(profilePath(curator));
  revalidatePath(boardPath(curator, board.slug));
  return {};
}
