-- Per-person, per-tag counts for curator-balanced velocity on /radar and
-- the Signals feed. Applied 2026-10-12 as migration `person_tag_counts`.
-- Additive only: panel_composition and tag_velocity_counts are untouched.
--
-- WHY: once the panel grew past three people, the drift gate closed and
-- stayed closed (23.8% on 2026-10-12 against a 20% gate). Every new
-- curator lands 100% inside the window, so drift rises with every person
-- who joins, and the radar went blank. Balanced velocity — each person's
-- shift against their own history, averaged with one vote each — is the
-- reading that the gate's confound cannot reach, so it is what publishes
-- when the gate is closed (lib/curator-velocity.ts, resolveGlobalVelocity).
--
-- Same rules as panel_composition_at, cell by cell:
--   * grouped by PERSON via curator_identities, coalesce never inner join,
--     so an unmapped name is its own person and never a dropped row;
--   * published vocabulary only (published by as_of), both sides;
--   * active clips only; applications that existed by as_of.
--
-- No names leave the database. `person_ix` is an ordinal assigned per
-- call — enough to group rows by person, useless for identifying one.

create or replace function public.person_tag_counts_at(
  window_days integer,
  as_of timestamptz default now()
)
returns table(person_ix integer, tag_id uuid, base_count bigint, recent_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  with a as (
    select coalesce(ci.person, c.clipped_by_name) as person, ct.tag_id, ct.created_at
    from clip_tags ct
    join clips c on c.id = ct.clip_id
    join tags t on t.id = ct.tag_id
    left join curator_identities ci on ci.name = c.clipped_by_name
    where c.archived_at is null
      and c.clipped_by_name is not null
      and t.published_at is not null
      and t.published_at <= as_of
      and ct.created_at <= as_of
  )
  select
    (dense_rank() over (order by person))::integer,
    tag_id,
    count(*),
    count(*) filter (where created_at > as_of - make_interval(days => window_days))
  from a
  group by person, tag_id;
$$;

revoke all on function public.person_tag_counts_at(integer, timestamptz) from public;
grant execute on function public.person_tag_counts_at(integer, timestamptz) to anon, authenticated, service_role;
