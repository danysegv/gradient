-- Applied 2026-09-30 via Supabase MCP (migration notifications).
-- In-app notifications (Daniela): someone followed you, liked your clip,
-- added it to a public plate, or shared a thought on it (or replied to
-- yours). Names cascade with renames; deleting the clip, plate or thought
-- takes its notifications with it. Operator-only table: read and written
-- through the server with the signed-in curator's name, never by anon.
create table if not exists notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_name text not null references profiles(name) on update cascade on delete cascade,
  actor_name     text references profiles(name) on update cascade on delete cascade,
  kind           text not null check (kind in ('follow', 'like', 'plate', 'thought', 'reply')),
  clip_id        uuid references clips(id) on delete cascade,
  board_id       uuid references boards(id) on delete cascade,
  note_id        uuid references clip_notes(id) on delete cascade,
  created_at     timestamptz not null default now(),
  read_at        timestamptz,
  check (actor_name is null or actor_name <> recipient_name)
);
create index if not exists notifications_inbox_idx on notifications (recipient_name, created_at desc);
create index if not exists notifications_unread_idx on notifications (recipient_name) where read_at is null;

alter table notifications enable row level security;
revoke all on notifications from anon, authenticated;
