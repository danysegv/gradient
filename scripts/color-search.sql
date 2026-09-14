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

-- Added 2026-09-14. Whether ANY clip has had its colours read, so a colour
-- search with no results can say "colour search isn't ready yet" instead of
-- "nothing is yellow" — a different and much more misleading claim, and the
-- one the library makes until the backfill has run. Returns one boolean and
-- no colour data, same boundary as search_clips.
create or replace function public.colors_ready()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (select 1 from clip_colors);
$$;
revoke execute on function public.colors_ready() from public;
grant execute on function public.colors_ready() to anon, authenticated;

-- Added 2026-09-14. A clip is filed under ONE colour.
--
-- Search matches only is_primary, so every clip appears under exactly one
-- swatch. Which one is decided by lib/color/primary.ts: the strongest hue
-- above CHROMATIC_FLOOR, or the largest neutral when the image really is
-- just black, white and grey.
--
-- The literal largest bucket would be wrong. Design references sit on white,
-- grey and black — a red poster on a white wall is ~70% white — so taking
-- the maximum by pixel count would file most of the library under White and
-- leave Red empty.
--
-- Every other bucket is still stored. Retuning the rule is then an UPDATE
-- over clip_colors, not a re-read of every image.
alter table clip_colors add column if not exists is_primary boolean not null default false;
create unique index if not exists clip_colors_one_primary_idx
  on clip_colors (clip_id) where is_primary;
-- search_clips matches `cc.is_primary` in both branches (definition applied
-- 2026-09-14; same signature, so grants are preserved).

-- Backfill applied 2026-09-14, after the first run of scripts/read-colors.ts
-- predated is_primary and left every row false (the column default), so every
-- swatch matched nothing while 156 clips had perfectly good colours.
--
-- No image is re-read. This is the reason the full breakdown is stored rather
-- than collapsing to one colour at write time: the rule is a constant over
-- data already on disk, so changing or repairing it is an UPDATE. Re-run this
-- verbatim after changing CHROMATIC_FLOOR in lib/color/primary.ts.
with ranked as (
  select clip_id, bucket,
         row_number() over (
           partition by clip_id
           order by
             (case when bucket not in ('black','grey','white')
                    and coverage >= 0.15 then 0 else 1 end),
             coverage desc,
             bucket asc
         ) as rn
  from clip_colors
)
update clip_colors cc
set is_primary = (r.rn = 1)
from ranked r
where r.clip_id = cc.clip_id and r.bucket = cc.bucket;

-- Added 2026-09-14. Where a clip's colours came from.
--
-- 'model' — the Haiku describer's estimate, written when a clip is first
--           added so it is colour-searchable the moment it lands.
-- 'pixels' — scripts/read-colors.ts, exact.
--
-- Existing rows default to 'pixels', which is correct: they were all written
-- by the backfill. The watcher (scripts/install-colour-watcher.sh) re-reads
-- only source = 'model', so a new clip costs one image fetch a few minutes
-- later instead of re-reading the whole library.
alter table clip_colors add column if not exists source text not null default 'pixels';
-- Backfill first (every existing row came from the script), THEN flip the
-- default to 'model'. The default is the fail-safe: a write from code that
-- doesn't declare its provenance — the deployed describer, or anything
-- added later — is treated as an estimate and re-read, rather than
-- inheriting a claim of exactness nobody checked.
alter table clip_colors alter column source set default 'model';
create index if not exists clip_colors_source_idx on clip_colors (source) where source = 'model';
