-- ============================================================
-- Attention, counted like every other trait — 2026-09-23. Applied via
-- Supabase MCP.
--
-- The Attention block on /curator/[name] read the same on every profile:
-- Layout full, everything else under it. Two reasons, both ours.
--
--   1. It counted every clip_tags row. A 0.2-confidence guess is not a
--      trait anywhere else on the site (chips, traits, the board radar
--      all use 0.5), so the axis with the most tags in the vocabulary
--      collected the most readings — Layout, for all four curators.
--   2. Each bar was drawn against the biggest axis, so whatever came
--      first was a full bar by construction.
--
-- This function fixes (1): one row per axis, readings at or above
-- min_confidence, for the curator and for the whole library, published
-- tags only — the same vocabulary the shares on that page are of. The
-- page fixes (2) with a fixed track.
-- ============================================================
create or replace function public.curator_axis_attention(
  curator_name text,
  min_confidence numeric default 0.5
)
returns table ("group" text, curator_readings bigint, library_readings bigint)
language sql
stable
set search_path to 'public'
as $function$
  with readings as (
    select t."group"::text as axis, c.clipped_by_name
    from clip_tags ct
    join clips c on c.id = ct.clip_id
    join tags t on t.id = ct.tag_id
    where c.archived_at is null
      and ct.confidence >= min_confidence
      and t.published_at is not null
  )
  select
    g.axis,
    count(*) filter (where lower(r.clipped_by_name) = lower(curator_name)),
    count(r.axis)
  from (select distinct t."group"::text as axis from tags t where t.published_at is not null) g
  left join readings r on r.axis = g.axis
  group by g.axis
  order by g.axis;
$function$;

revoke execute on function public.curator_axis_attention(text, numeric) from public;
grant execute on function public.curator_axis_attention(text, numeric) to anon, authenticated, service_role;
