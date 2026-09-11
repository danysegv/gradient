-- ============================================================
-- Search — 2026-09-11. Applied via Supabase MCP.
--
-- One search bar finds clips by what is IN the image, not only by what
-- someone typed about it. Claude looks at each image once and writes a
-- literal description plus search keywords with synonyms. Those live in
-- clip_descriptions, a separate table:
--
--   * never clip_tags — a description is not a tag, has no axis, and can
--     never enter a count, a share, a velocity or panel drift;
--   * search-only — decided 2026-09-11: descriptions are not shown. The
--     table has RLS on, NO policy, and no grants to anon or authenticated.
--     search_clips is SECURITY DEFINER so it can read them, and returns
--     clip ids and a rank, never the text. The function is the boundary,
--     the same pattern as panel_composition.
--
-- Search document per active clip, weighted:
--   A  tag names (CamelCase split, so "PhotoWork" matches "photo") and
--      universal terms, confidence >= 0.5; Claude's keywords
--   B  title
--   C  Claude's summary
--   D  caption and credits
-- Built per call. Fine at hundreds of clips; move to a stored tsvector
-- with a GIN index before the library reaches the tens of thousands.
-- ============================================================

create table public.clip_descriptions (
  clip_id       uuid primary key references public.clips(id) on delete cascade,
  summary       text not null check (char_length(summary) <= 600),
  keywords      text[] not null default '{}',
  model         text not null,
  described_at  timestamptz not null default now()
);
alter table public.clip_descriptions enable row level security;
revoke all on public.clip_descriptions from anon, authenticated;

-- The describe queue: active clips with an image, not parked, not yet
-- described. Newest first, so fresh clips become searchable first.
create function public.clips_missing_descriptions(row_limit integer default null)
returns table (id uuid, url text, image_url text, title text, caption text)
language sql
stable
set search_path to 'public'
as $function$
  select c.id, c.url, c.image_url, c.title, c.caption
  from clips c
  where c.archived_at is null
    and c.image_url is not null
    and not exists (select 1 from clip_classification_failures f where f.clip_id = c.id)
    and not exists (select 1 from clip_descriptions d where d.clip_id = c.id)
  order by c.clipped_at desc
  limit row_limit;
$function$;
revoke execute on function public.clips_missing_descriptions(integer) from public, anon, authenticated;
grant execute on function public.clips_missing_descriptions(integer) to service_role;

-- Every word must match ("film photography" = film AND photography), and
-- the last word matches as a prefix so results arrive while typing. When
-- nothing matches every word, clips matching ANY word come back with
-- exact = false, so the page can say so instead of showing an empty grid.
create function public.search_clips(q text, row_limit integer default 500)
returns table (clip_id uuid, rank real, exact boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  q_text  text := left(coalesce(q, ''), 200);
  q_all   tsquery;
  q_any   tsquery;
  lexemes text[];
begin
  q_all := websearch_to_tsquery('english', q_text);
  if q_all is null or numnode(q_all) = 0 then
    return;
  end if;
  -- Prefix-match the final lexeme: 'photo' also finds 'photographi'.
  q_all := to_tsquery('english',
    regexp_replace(q_all::text, '''([^'']+)''\s*$', '''\1'':*'));

  lexemes := tsvector_to_array(to_tsvector('english', q_text));
  if array_length(lexemes, 1) > 1 then
    q_any := to_tsquery('english', array_to_string(
      array(select quote_literal(l) from unnest(lexemes) as l), ' | '));
  end if;

  return query
  with docs as (
    select
      c.id as cid,
      setweight(to_tsvector('english', coalesce((
        select string_agg(
          regexp_replace(t.editorial_name, '([a-z])([A-Z])', '\1 \2', 'g')
            || ' ' || t.universal_term, ' ')
        from clip_tags ct join tags t on t.id = ct.tag_id
        where ct.clip_id = c.id and ct.confidence >= 0.5
      ), '')), 'A')
      || setweight(to_tsvector('english', coalesce(array_to_string(d.keywords, ' '), '')), 'A')
      || setweight(to_tsvector('english', coalesce(c.title, '')), 'B')
      || setweight(to_tsvector('english', coalesce(d.summary, '')), 'C')
      || setweight(to_tsvector('english',
           concat_ws(' ', c.caption, c.creator, c.rights_holder, c.source, c.found_via)), 'D')
        as doc
    from clips c
    left join clip_descriptions d on d.clip_id = c.id
    where c.archived_at is null
  ),
  hits as (
    select cid, ts_rank_cd(doc, q_all) as r from docs where doc @@ q_all
  )
  select h.cid, h.r, true from hits h
  union all
  select dd.cid, ts_rank_cd(dd.doc, q_any), false
  from docs dd
  where q_any is not null
    and not exists (select 1 from hits)
    and dd.doc @@ q_any
  order by 3 desc, 2 desc
  limit row_limit;
end;
$function$;
revoke execute on function public.search_clips(text, integer) from public;
grant execute on function public.search_clips(text, integer) to anon, authenticated, service_role;

-- Boards by title and description. SECURITY INVOKER, so RLS decides: anon
-- sees public boards only. The service role (used only for a signed-in
-- curator) sees every board, so viewer_name narrows it to public boards
-- plus that curator's own. scope_owner limits results to one profile.
create function public.search_boards(
  q text,
  viewer_name text default null,
  scope_owner text default null,
  row_limit integer default 24
)
returns table (board_id uuid, rank real)
language sql
stable
set search_path to 'public'
as $function$
  with query as (
    select websearch_to_tsquery('english', left(coalesce(q, ''), 200)) as tsq
  )
  select b.id,
    ts_rank_cd(
      setweight(to_tsvector('english', b.title), 'A')
      || setweight(to_tsvector('english', coalesce(b.description, '')), 'B'),
      query.tsq)
  from boards b, query
  where numnode(query.tsq) > 0
    and (b.is_public or b.owner_name = viewer_name)
    and (scope_owner is null or b.owner_name = scope_owner)
    and (setweight(to_tsvector('english', b.title), 'A')
         || setweight(to_tsvector('english', coalesce(b.description, '')), 'B')) @@ query.tsq
  order by 2 desc
  limit row_limit;
$function$;
revoke execute on function public.search_boards(text, text, text, integer) from public;
grant execute on function public.search_boards(text, text, text, integer) to anon, authenticated, service_role;
