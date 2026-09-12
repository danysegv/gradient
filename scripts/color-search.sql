-- Applied 2026-09-12. Colour search: the swatch row under the search bar.
--
-- Colours are search-only, exactly like clip_descriptions: no axis, no
-- confidence, never in any count, share, velocity or panel denominator.
-- RLS on with no policy and no grants; reached only through search_clips,
-- which is SECURITY DEFINER and returns ids and rank, never colour data.
create table if not exists clip_colors (
  clip_id uuid not null references clips(id) on delete cascade,
  bucket text not null,
  coverage numeric not null check (coverage > 0 and coverage <= 1),
  hex text not null,
  described_at timestamptz not null default now(),
  primary key (clip_id, bucket)
);
alter table clip_colors enable row level security;
revoke all on clip_colors from anon, authenticated;
create index if not exists clip_colors_bucket_idx on clip_colors (bucket, coverage desc);

-- Backfill queue. Its own queue, not a subset of clips_missing_descriptions:
-- every clip described before colour existed has a description and no colours.
create or replace function public.clips_missing_colors(row_limit integer default null)
returns table(id uuid, url text, image_url text, title text, caption text)
language sql stable set search_path to 'public' as $$
  select c.id, c.url, c.image_url, c.title, c.caption
  from clips c
  where c.archived_at is null
    and c.image_url is not null
    and not exists (select 1 from clip_classification_failures f where f.clip_id = c.id)
    and not exists (select 1 from clip_colors cc where cc.clip_id = c.id)
  order by c.clipped_at desc
  limit row_limit;
$$;

-- search_clips gained a third argument, `color`. NOTE: adding it as a
-- defaulted parameter creates an OVERLOAD — the old two-argument function
-- must be dropped, or every call is ambiguous:
--   drop function if exists public.search_clips(text, integer);
-- Dropping also resets grants, so re-check them against search_boards:
--   revoke execute on function public.search_clips(text, integer, text) from public;
-- (the definition itself lives in the migration applied 2026-09-12; colour
--  narrows the candidate set and never contributes to rank, and a colour
--  with no words browses the bucket by coverage.)
