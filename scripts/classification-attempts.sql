-- ============================================================
-- A clip is attempted once per vocabulary — 2026-09-17. Applied via
-- Supabase MCP. Replaces clips_needing_classification from
-- scripts/clips-needing-classification.sql (same filters, one more).
--
-- THE LOOP THIS CLOSES. The queue asks "is this clip missing a medium
-- tag / any incubating tag / any published tag?" A painting has no medium
-- in the vocabulary, so the classifier correctly returns none, the clip
-- still matches, and it goes straight back into the queue. Every Classify
-- press paid for it again. On 2026-09-17, 13 of the 15 queued clips were
-- in that state: the queue could never reach zero.
--
-- The fix records that a clip WAS read, and against which vocabulary.
-- A clip whose last successful attempt is newer than the last change to
-- `tags` (a tag created, or a tag published) is left alone. Add or
-- graduate a tag and every such clip becomes eligible again, exactly
-- once, because the answer might now be different.
--
-- Recorded only after a SUCCESSFUL classification (app/clip/
-- classify-actions.ts). A failure is not an answer: an account-level
-- error must leave the clip queued, and an unreadable image is parked,
-- which is its own table.
-- ============================================================

create table if not exists public.clip_classification_attempts (
  clip_id uuid primary key references public.clips(id) on delete cascade,
  mode text not null check (mode in ('full', 'incubating')),
  attempted_at timestamptz not null default now()
);
alter table public.clip_classification_attempts enable row level security;
revoke all on public.clip_classification_attempts from public, anon, authenticated;

create or replace function public.record_classification_attempt(p_clip_id uuid, p_mode text)
returns void
language sql
volatile
set search_path to 'public'
as $function$
  insert into clip_classification_attempts (clip_id, mode, attempted_at)
  values (p_clip_id, p_mode, now())
  on conflict (clip_id) do update
    set mode = excluded.mode, attempted_at = excluded.attempted_at;
$function$;
revoke execute on function public.record_classification_attempt(uuid, text) from public, anon, authenticated;
grant execute on function public.record_classification_attempt(uuid, text) to service_role;

create or replace function public.clips_needing_classification(row_limit integer default null)
returns table (id uuid, url text, image_url text, title text, caption text, mode text)
language sql
stable
set search_path to 'public'
as $function$
  with vocabulary as (
    select greatest(max(created_at), coalesce(max(published_at), '-infinity')) as changed_at
    from tags
  ),
  candidates as (
    select
      c.id, c.url, c.image_url, c.title, c.caption, c.clipped_at,
      exists (
        select 1 from clip_tags ct join tags t on t.id = ct.tag_id
        where ct.clip_id = c.id and t.published_at is not null
      ) as has_published,
      exists (
        select 1 from clip_tags ct join tags t on t.id = ct.tag_id
        where ct.clip_id = c.id and t.published_at is null
      ) as has_incubating,
      exists (
        select 1 from clip_tags ct join tags t on t.id = ct.tag_id
        where ct.clip_id = c.id and t."group" = 'medium'
      ) as has_medium
    from clips c
    where c.archived_at is null
      and c.image_url is not null
      and not exists (
        select 1 from clip_classification_failures f where f.clip_id = c.id
      )
      and not exists (
        select 1 from clip_classification_attempts a, vocabulary v
        where a.clip_id = c.id and a.attempted_at > v.changed_at
      )
  )
  select id, url, image_url, title, caption,
    case when not has_published then 'full' else 'incubating' end as mode
  from candidates
  where not has_published
     or not has_incubating
     or not has_medium
  order by clipped_at asc
  limit row_limit;
$function$;
revoke execute on function public.clips_needing_classification(integer) from public, anon, authenticated;
grant execute on function public.clips_needing_classification(integer) to service_role;
