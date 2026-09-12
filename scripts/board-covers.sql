-- Applied 2026-09-12. Owner-chosen board covers.
-- NULL means the default: the first four clips in board order, resolved by
-- lib/boards/cover.ts, so rearranging a board rearranges its cover with it.
alter table boards add column if not exists cover_clip_ids uuid[];

alter table boards drop constraint if exists boards_cover_clip_ids_len;
alter table boards add constraint boards_cover_clip_ids_len
  check (cover_clip_ids is null or array_length(cover_clip_ids, 1) between 1 and 4);

comment on column boards.cover_clip_ids is
  'Owner-chosen cover clips, in display order. NULL means the default: the first four clips in board order (position asc nulls last, added_at desc). Resolved by lib/boards/cover.ts — a chosen clip that leaves the board is skipped and the cover is topped up from board order.';
