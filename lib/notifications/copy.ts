// What a notification says and where it goes. Pure, so every kind is
// tested. Quiet, like the rest of the product: the name, the act, the
// thing — no exclamation marks.

export type NotificationKind = "follow" | "like" | "plate" | "thought" | "reply";

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  actor_name: string | null;
  clip_id: string | null;
  clip_title: string | null;
  board_title: string | null;
  board_slug: string | null;
  board_owner: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationView = {
  id: string;
  actor: string | null;
  text: string;
  href: string;
  unread: boolean;
  createdAt: string;
};

const clipName = (title: string | null) => (title && title.trim() ? `“${title.trim()}”` : "your clip");

export function describe(n: NotificationRow): NotificationView {
  const who = n.actor_name;
  const clipHref = n.clip_id ? `/clip/${n.clip_id}` : "/";
  let text: string;
  let href: string;
  switch (n.kind) {
    case "follow":
      text = "followed you";
      href = who ? `/curator/${encodeURIComponent(who)}` : "/curators";
      break;
    case "like":
      text = `liked ${clipName(n.clip_title)}`;
      href = clipHref;
      break;
    case "plate":
      text = `added ${clipName(n.clip_title)} to ${n.board_title ? `the plate “${n.board_title}”` : "a plate"}`;
      href =
        n.board_owner && n.board_slug
          ? `/curator/${encodeURIComponent(n.board_owner)}/boards/${encodeURIComponent(n.board_slug)}`
          : clipHref;
      break;
    case "thought":
      text = `shared a thought on ${clipName(n.clip_title)}`;
      href = `${clipHref}#thoughts`;
      break;
    case "reply":
      text = `replied to your thought on ${clipName(n.clip_title)}`;
      href = `${clipHref}#thoughts`;
      break;
  }
  return { id: n.id, actor: who, text, href, unread: n.read_at === null, createdAt: n.created_at };
}

/** "now", "5m", "3h", "2d", then a date. */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
