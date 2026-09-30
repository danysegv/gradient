import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { NotificationKind, NotificationRow } from "./copy";

// Writing and reading notifications. Every write is best-effort: a
// notification that fails to save must never fail the follow, like, save
// or thought that caused it, so nothing here throws.
//
// The rules, in one place:
//   - never notify yourself;
//   - a clip's notifications go to the curator who clipped it;
//   - doing the same thing twice leaves one notification, the newest;
//   - undoing it (unfollow, unlike, taking a clip off a plate) removes the
//     notification if it hasn't been seen yet, so nobody is told about
//     something that no longer happened.

type Target = { clipId?: string | null; boardId?: string | null; noteId?: string | null };

async function clipOwner(clipId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("clips").select("clipped_by_name").eq("id", clipId).maybeSingle();
  return (data as { clipped_by_name: string | null } | null)?.clipped_by_name ?? null;
}

async function deleteSame(
  recipient: string,
  kind: NotificationKind,
  actor: string | null,
  t: Target,
  unreadOnly: boolean
) {
  let q = supabaseAdmin.from("notifications").delete().eq("recipient_name", recipient).eq("kind", kind);
  q = actor === null ? q.is("actor_name", null) : q.eq("actor_name", actor);
  q = t.clipId ? q.eq("clip_id", t.clipId) : q.is("clip_id", null);
  q = t.boardId ? q.eq("board_id", t.boardId) : q.is("board_id", null);
  if (unreadOnly) q = q.is("read_at", null);
  await q;
}

export async function notify(
  input: { kind: NotificationKind; actor: string | null; recipient?: string | null } & Target
): Promise<void> {
  try {
    const recipient = input.recipient ?? (input.clipId ? await clipOwner(input.clipId) : null);
    if (!recipient || recipient === input.actor) return;
    // Thoughts are each their own event; everything else collapses to one.
    if (input.kind !== "thought" && input.kind !== "reply") {
      await deleteSame(recipient, input.kind, input.actor, input, false);
    }
    await supabaseAdmin.from("notifications").insert({
      recipient_name: recipient,
      actor_name: input.actor,
      kind: input.kind,
      clip_id: input.clipId ?? null,
      board_id: input.boardId ?? null,
      note_id: input.noteId ?? null,
    });
  } catch (err) {
    console.error("[notifications] notify failed:", err);
  }
}

export async function unnotify(
  input: { kind: NotificationKind; actor: string | null; recipient?: string | null } & Target
): Promise<void> {
  try {
    const recipient = input.recipient ?? (input.clipId ? await clipOwner(input.clipId) : null);
    if (!recipient) return;
    await deleteSame(recipient, input.kind, input.actor, input, true);
  } catch (err) {
    console.error("[notifications] unnotify failed:", err);
  }
}

export async function unreadCount(recipient: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_name", recipient)
    .is("read_at", null);
  return count ?? 0;
}

type InboxRaw = {
  id: string;
  kind: NotificationKind;
  actor_name: string | null;
  clip_id: string | null;
  created_at: string;
  read_at: string | null;
  clips: { title: string | null } | null;
  boards: { title: string; slug: string; owner_name: string } | null;
};

export async function inbox(recipient: string, limit = 60): Promise<NotificationRow[] | null> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id, kind, actor_name, clip_id, created_at, read_at, clips ( title ), boards ( title, slug, owner_name )")
    .eq("recipient_name", recipient)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error(`[notifications] inbox failed: ${error.message}`);
    return null;
  }
  return ((data ?? []) as unknown as InboxRaw[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    actor_name: r.actor_name,
    clip_id: r.clip_id,
    clip_title: r.clips?.title ?? null,
    board_title: r.boards?.title ?? null,
    board_slug: r.boards?.slug ?? null,
    board_owner: r.boards?.owner_name ?? null,
    created_at: r.created_at,
    read_at: r.read_at,
  }));
}

export async function markAllRead(recipient: string): Promise<void> {
  await supabaseAdmin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_name", recipient)
    .is("read_at", null);
}
