-- The Visual Genome over the WHOLE vocabulary, incubating looks included.
-- Applied 2026-10-01 as migration `genome_cooccurrence_all`. Additive only:
-- tag_cooccurrence stays published-only and is no longer called by the app.
--
-- Why this does not break the incubation freeze (lib/taxonomy-freeze.ts):
-- the freeze withholds figures that are shares of the library-wide
-- published denominator. A genome cell is a share of ONE look's own
-- references (both / from_total) — no library total is involved on either
-- side. The page still marks every cell touching an incubating look in
-- Slate, and keeps one-way pulls and headline counts published-only.

create or replace function public.tag_cooccurrence_all()
returns table(
  from_tag_id uuid, from_name text, from_group text, from_total bigint,
  from_published boolean,
  to_tag_id uuid, to_name text, both_count bigint
)
language sql
stable
set search_path to 'public'
as $$
  with active as (
    select ct.clip_id, ct.tag_id
    from clip_tags ct
    join clips c on c.id = ct.clip_id
    where c.archived_at is null
  ),
  totals as (select tag_id, count(*) n from active group by tag_id)
  select
    a.tag_id, ta.editorial_name, ta."group"::text, tot.n,
    ta.published_at is not null,
    b.tag_id, tb.editorial_name, count(*)
  from active a
  join active b on b.clip_id = a.clip_id and b.tag_id <> a.tag_id
  join tags ta on ta.id = a.tag_id
  join tags tb on tb.id = b.tag_id
  join totals tot on tot.tag_id = a.tag_id
  group by a.tag_id, ta.editorial_name, ta."group", tot.n, ta.published_at,
           b.tag_id, tb.editorial_name
  order by tot.n desc, count(*) desc;
$$;

grant execute on function public.tag_cooccurrence_all() to anon, authenticated;
