-- ============================================================
-- One classification queue, two modes — 2026-09-11. Applied via
-- Supabase MCP. Supersedes clips_missing_published_tags (same day) and
-- clips_missing_incubating_tags (2026-08-28) — both dropped below.
--
-- A clip needs classification for one of two distinct reasons, and the
-- two need different classifiers:
--
--   mode 'full'       zero published clip_tags rows. Usually a clip
--                      whose classifyAndTagClip call failed at clip time
--                      (an Anthropic account-level error — e.g. "credit
--                      balance too low" — that app/clip/actions.ts
--                      deliberately doesn't let block clip creation), or
--                      a clip classified once with only the incubating
--                      vocabulary. There is no published application to
--                      re-date, so the FULL classifier is safe to run.
--
--   mode 'incubating'  already has a published tag, but is missing some
--                      tag from the current incubating vocabulary (or
--                      the medium axis specifically). Only the
--                      incubating-only path may touch a clip in this
--                      state — the full classifier would write published
--                      applications timestamped now, inside the trailing
--                      window, and swamp a board whose whole range is
--                      ±2.5 points.
--
-- The row carries the mode; the caller (app/clip/classify-actions.ts)
-- only dispatches on it, never decides it. Same active/has-image/
-- not-parked filter as every other queue RPC. Oldest first.
-- ============================================================

create or replace function public.clips_needing_classification(row_limit integer default null)
returns table (id uuid, url text, image_url text, title text, caption text, mode text)
language sql
stable
set search_path to 'public'
as $function$
  with candidates as (
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

drop function if exists public.clips_missing_published_tags(integer);
drop function if exists public.clips_missing_incubating_tags(integer);
