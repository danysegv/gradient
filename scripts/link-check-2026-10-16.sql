-- Daily link check (2026-10-16). Run once in the Supabase SQL editor.
-- Adds the columns lib/clips/link-sweep.ts reads and writes, and the
-- 'link_gone' notification kind. New clips columns are NOT granted to anon
-- or authenticated (clips uses column grants since security review #9), so
-- none of this is readable from the public site.

alter table public.clips
  add column if not exists link_checked_at timestamptz,
  add column if not exists link_strikes integer not null default 0,
  add column if not exists link_last_strike_at timestamptz,
  add column if not exists link_kept boolean not null default false,
  add column if not exists archived_reason text;

alter table public.clips drop constraint if exists clips_archived_reason_check;
alter table public.clips add constraint clips_archived_reason_check
  check (archived_reason is null or archived_reason in ('link_gone'));

create index if not exists clips_link_check_queue
  on public.clips (link_checked_at nulls first)
  where archived_at is null and link_kept = false;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['follow','like','plate','thought','reply','link_gone']));
