-- The Trend Radar's weekly trail: the same two readings the radar makes
-- today, made as of an earlier instant. Applied 2026-09-25 as migration
-- `radar_as_of_readings`. Additive only — tag_velocity_counts and
-- panel_composition are untouched and still serve every other surface.
--
-- "As of" means: only tag applications that existed by then
-- (clip_tags.created_at <= as_of), the trailing window ending then, and
-- the vocabulary published by then (tags.published_at <= as_of), so a tag
-- that graduated this week has no position last week rather than a
-- fabricated one. Archiving is read as it stands NOW: an archived clip
-- leaves the past too, the same as every other figure in the product.

create or replace function public.tag_velocity_counts_at(
  window_days integer,
  as_of timestamptz
)
returns table(
  tag_id uuid, "group" text, editorial_name text, universal_term text,
  clip_count bigint, recent_count bigint,
  earliest_reference_at timestamptz, latest_reference_at timestamptz,
  is_published boolean
)
language sql
stable
set search_path to 'public'
as $$
  -- Same shape as tag_velocity_counts, archived clips pre-filtered inside
  -- the subquery for the same reason (see that function).
  select
    t.id, t."group"::text, t.editorial_name, t.universal_term,
    count(a.clip_id),
    count(a.clip_id) filter (
      where a.created_at > as_of - make_interval(days => window_days)
    ),
    min(a.created_at), max(a.created_at),
    (t.published_at is not null and t.published_at <= as_of)
  from tags t
  left join (
    select ct.tag_id, ct.clip_id, ct.created_at
    from clip_tags ct
    join clips c on c.id = ct.clip_id
    where c.archived_at is null
      and ct.created_at <= as_of
  ) a on a.tag_id = t.id
  group by t.id, t."group", t.editorial_name, t.universal_term, t.published_at
  order by count(a.clip_id) desc;
$$;

create or replace function public.panel_composition_at(
  window_days integer,
  as_of timestamptz
)
returns table(person text, base_count bigint, recent_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  -- Same as panel_composition: coalesce, never an inner join, so a curator
  -- without a mapping row still counts as their own person.
  select
    coalesce(ci.person, c.clipped_by_name),
    count(*),
    count(*) filter (
      where ct.created_at > as_of - make_interval(days => window_days)
    )
  from clip_tags ct
  join clips c on c.id = ct.clip_id
  join tags t on t.id = ct.tag_id
  left join curator_identities ci on ci.name = c.clipped_by_name
  where c.archived_at is null
    and c.clipped_by_name is not null
    and t.published_at is not null
    and t.published_at <= as_of
    and ct.created_at <= as_of
  group by coalesce(ci.person, c.clipped_by_name)
  order by count(*) desc;
$$;

grant execute on function public.tag_velocity_counts_at(integer, timestamptz) to anon, authenticated;
grant execute on function public.panel_composition_at(integer, timestamptz) to anon, authenticated;
