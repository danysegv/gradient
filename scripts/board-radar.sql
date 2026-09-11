-- ============================================================
-- Board radar — 2026-09-11. Applied via Supabase MCP.
--
-- Library-wide presence of each PUBLISHED tag: how many active clips
-- carry it at or above min_confidence, and how many active clips carry
-- any tag at all. The board radar compares a board's make-up against
-- this. It is a count of clips, not of applications, and not a trend:
-- no window, no velocity, nothing the 09-26 board depends on.
--
-- Published only, per the freeze: an incubating tag gets no library-wide
-- share. On a board it still shows what share of that board carries it,
-- which is a fact about the board, not about the library.
-- ============================================================
create function public.tag_clip_presence(min_confidence numeric default 0.5)
returns table (tag_id uuid, editorial_name text, "group" text, clips bigint, classified_clips bigint)
language sql
stable
set search_path to 'public'
as $function$
  with active as (
    select c.id from clips c where c.archived_at is null
  ),
  classified as (
    select count(distinct ct.clip_id) as n
    from clip_tags ct join active a on a.id = ct.clip_id
  )
  select
    t.id,
    t.editorial_name,
    t."group"::text,
    count(distinct ct.clip_id) filter (where ct.confidence >= min_confidence),
    (select n from classified)
  from tags t
  left join clip_tags ct
    on ct.tag_id = t.id
   and exists (select 1 from active a where a.id = ct.clip_id)
  where t.published_at is not null
  group by t.id, t.editorial_name, t."group"
  order by 2;
$function$;

revoke execute on function public.tag_clip_presence(numeric) from public;
grant execute on function public.tag_clip_presence(numeric) to anon, authenticated, service_role;
