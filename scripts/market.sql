-- Applied 2026-09-28 via Supabase MCP (migration market_series).
-- The market series (2026-09-28). What the design press is showing, read
-- with the same classifier and the same vocabulary as the library, so the
-- two can be compared on /radar.
--
-- THE LEGAL SHAPE, in the schema itself:
--   * A source is off until a person has reviewed it (enabled = false by
--     default, reviewed_at + review_note record who read its terms).
--   * Only facts are kept: the item's link, title, date and the tags the
--     classifier derived. No image, no article text. image_url is the
--     address the classifier was pointed at, kept for audit and re-reading;
--     it is never selected by a public page.
--   * market_optouts: any domain listed here is skipped and its items
--     deleted. A publisher asking out is honoured by one insert.
--   * Public pages see aggregates only (market_tag_counts, market_status),
--     through SECURITY DEFINER functions. Items are not readable by anon.

create table if not exists market_sources (
  id            text primary key,              -- slug, e.g. 'dezeen'
  name          text not null,
  kind          text not null check (kind in ('rss', 'museum', 'arena')),
  -- 'market' = what is being published now; 'archive' = the historical
  -- baseline (museum open access). Never pooled: the archive is not in
  -- any market share.
  series        text not null default 'market' check (series in ('market', 'archive')),
  feed_url      text not null,
  homepage      text not null,
  terms_url     text,
  verdict       text not null check (verdict in ('green', 'amber', 'red')),
  review_note   text not null,
  reviewed_at   timestamptz not null default now(),
  enabled       boolean not null default false,
  -- Written by each run: what the automatic checks found this time.
  last_polled_at timestamptz,
  last_status    text,
  paused_reason  text
);

create table if not exists market_items (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null references market_sources(id) on delete cascade,
  url           text not null unique,
  image_url     text,
  title         text,
  published_at  timestamptz,
  discovered_at timestamptz not null default now(),
  status        text not null default 'candidate'
                check (status in ('candidate', 'classified', 'refused', 'failed')),
  status_note   text,
  classified_at timestamptz
);
create index if not exists market_items_status_idx on market_items (status, discovered_at desc);
create index if not exists market_items_classified_idx on market_items (classified_at desc) where status = 'classified';

create table if not exists market_item_tags (
  item_id    uuid not null references market_items(id) on delete cascade,
  tag_id     uuid not null references tags(id) on delete cascade,
  confidence real not null,
  created_at timestamptz not null default now(),
  primary key (item_id, tag_id)
);

create table if not exists market_optouts (
  domain     text primary key,     -- registrable host, e.g. 'dezeen.com'
  requested_at timestamptz not null default now(),
  note       text
);

-- An opt-out removes what was already read, not just what comes next.
create or replace function market_apply_optout() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from market_items i
  where lower(split_part(split_part(i.url, '://', 2), '/', 1)) = lower(new.domain)
     or lower(split_part(split_part(i.url, '://', 2), '/', 1)) like '%.' || lower(new.domain);
  update market_sources s set enabled = false, paused_reason = 'Opted out'
  where lower(split_part(split_part(s.homepage, '://', 2), '/', 1)) = lower(new.domain)
     or lower(split_part(split_part(s.homepage, '://', 2), '/', 1)) like '%.' || lower(new.domain);
  return new;
end $$;
drop trigger if exists market_optout_applies on market_optouts;
create trigger market_optout_applies after insert on market_optouts
  for each row execute function market_apply_optout();

alter table market_sources enable row level security;
alter table market_items enable row level security;
alter table market_item_tags enable row level security;
alter table market_optouts enable row level security;
revoke all on market_sources, market_items, market_item_tags, market_optouts from anon, authenticated;

-- Per published tag: market applications in the window, against the same
-- denominator rule as the library (published vocabulary only). Market
-- series only; the archive is never in it.
create or replace function market_tag_counts(window_days integer default 30)
returns table(tag_id uuid, recent_count bigint)
language sql stable security definer set search_path = public as $$
  select t.id, count(mit.item_id)
  from tags t
  left join (
    select mt.item_id, mt.tag_id
    from market_item_tags mt
    join market_items i on i.id = mt.item_id
    join market_sources s on s.id = i.source_id
    where s.series = 'market'
      and i.status = 'classified'
      and i.classified_at > now() - make_interval(days => window_days)
  ) mit on mit.tag_id = t.id
  where t.published_at is not null
  group by t.id;
$$;

-- What the page says about where the market reading comes from. Names and
-- homepages only, plus what each source is doing and why.
create or replace function market_status(window_days integer default 30)
returns table(
  source_id text, name text, homepage text, series text, enabled boolean,
  paused_reason text, last_polled_at timestamptz, items_read bigint
)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.homepage, s.series, s.enabled, s.paused_reason, s.last_polled_at,
    count(i.id) filter (
      where i.status = 'classified'
        and i.classified_at > now() - make_interval(days => window_days)
    )
  from market_sources s
  left join market_items i on i.source_id = s.id
  where s.verdict <> 'red'
  group by s.id
  order by s.series, s.name;
$$;

revoke all on function market_tag_counts(integer), market_status(integer), market_apply_optout() from public;
grant execute on function market_tag_counts(integer), market_status(integer) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Sources, as reviewed on 2026-09-28 (robots.txt, feed, terms of use).
-- GREEN are on. AMBER and Are.na are listed and off, each with the reason:
-- turning one on is a human decision, never the runner's.
-- ---------------------------------------------------------------------
insert into market_sources (id, name, kind, series, feed_url, homepage, terms_url, verdict, review_note, enabled) values
('dezeen', 'Dezeen', 'rss', 'market', 'https://www.dezeen.com/feed/', 'https://www.dezeen.com', 'https://www.dezeen.com/terms/', 'green',
 'robots.txt blocks no AI agent; terms have no scraping, TDM or AI clause.', true),
('designboom', 'designboom', 'rss', 'market', 'https://www.designboom.com/feed/', 'https://www.designboom.com', 'https://www.daaily.com/terms-conditions.html', 'green',
 'robots.txt blocks admin paths only; DAAily terms have no scraping, TDM or AI clause.', true),
('abduzeedo', 'Abduzeedo', 'rss', 'market', 'https://abduzeedo.com/rss.xml', 'https://abduzeedo.com', 'https://abduzeedo.com/terms-service-and-privacy-policy', 'green',
 'robots.txt allows / for all; terms have no relevant clause.', true),
('booooooom', 'Booooooom', 'rss', 'market', 'https://booooooom.com/feed/', 'https://booooooom.com', 'https://booooooom.com/terms-conditions/', 'green',
 'robots.txt blocks no AI agent; terms have no relevant clause.', true),
('aperture', 'Aperture', 'rss', 'market', 'https://aperture.org/feed/', 'https://aperture.org', 'https://aperture.org/privacy-policy/', 'green',
 'robots.txt blocks no AI agent; combined terms page has no relevant clause.', true),
('bpando', 'BP&O', 'rss', 'market', 'https://bpando.org/feed/', 'https://bpando.org', null, 'green',
 'robots.txt blocks no AI agent; no terms page could be found (re-check if one appears).', true),
('packagingoftheworld', 'Packaging of the World', 'rss', 'market', 'https://packagingoftheworld.com/feed', 'https://packagingoftheworld.com', null, 'green',
 'robots.txt: Crawl-delay 60 for all, nothing blocked; no terms page found. One feed request per run.', true),
('creativeboom', 'Creative Boom', 'rss', 'market', 'https://www.creativeboom.com/feed/', 'https://www.creativeboom.com', 'https://www.creativeboom.com/page/terms-conditions/', 'amber',
 'Terms bar use "in a systematic or regular manner so as to create a database". Off until they agree in writing.', false),
('colossal', 'Colossal', 'rss', 'market', 'https://www.thisiscolossal.com/feed/', 'https://www.thisiscolossal.com', 'https://www.thisiscolossal.com/legal/terms-of-service/', 'amber',
 'robots.txt blocks GPTBot and CCBot site-wide: read as an AI reservation. Off.', false),
('printmag', 'PRINT', 'rss', 'market', 'https://www.printmag.com/feed/', 'https://www.printmag.com', 'https://www.printmag.com/terms-of-use/', 'amber',
 'Terms bar "automated means to access the Services without consent". Off until they agree.', false),
('hypebeast', 'Hypebeast', 'rss', 'market', 'https://hypebeast.com/feed', 'https://hypebeast.com', 'https://hypebeast.com/terms', 'amber',
 'robots.txt welcomes Claude agents, but terms bar robots and spiders. Off until they agree.', false),
('designweek', 'Design Week', 'rss', 'market', 'https://www.designweek.co.uk/feed/', 'https://www.designweek.co.uk', 'https://www.designweek.co.uk/terms/', 'amber',
 'Terms require a licence for commercial use of content. Off until licensed.', false),
('artic', 'Art Institute of Chicago', 'museum', 'archive', 'https://api.artic.edu/api/v1/artworks/search', 'https://www.artic.edu', 'https://www.artic.edu/open-access/open-access-images', 'green',
 'Open access API; public-domain images released CC0. Archive baseline only.', true),
('met', 'The Met', 'museum', 'archive', 'https://collectionapi.metmuseum.org/public/collection/v1', 'https://www.metmuseum.org', 'https://www.metmuseum.org/policies/image-resources', 'green',
 'Open Access API; public-domain works CC0. Archive baseline only.', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Applied 2026-09-28 (migration market_window_by_published_date).
-- The market's clock is the PUBLICATION's date, not 04AM's reading date:
-- an article read today but published in June is not this month's market.
-- The runner also refuses anything published more than 90 days ago, or
-- undated (lib/market/plan.ts, MARKET_MAX_AGE_DAYS).
-- ---------------------------------------------------------------------
create or replace function market_tag_counts(window_days integer default 30)
returns table(tag_id uuid, recent_count bigint)
language sql stable security definer set search_path = public as $$
  select t.id, count(mit.item_id)
  from tags t
  left join (
    select mt.item_id, mt.tag_id
    from market_item_tags mt
    join market_items i on i.id = mt.item_id
    join market_sources s on s.id = i.source_id
    where s.series = 'market'
      and i.status = 'classified'
      and i.published_at > now() - make_interval(days => window_days)
      and i.published_at <= now() + interval '1 day'
  ) mit on mit.tag_id = t.id
  where t.published_at is not null
  group by t.id;
$$;

create or replace function market_status(window_days integer default 30)
returns table(
  source_id text, name text, homepage text, series text, enabled boolean,
  paused_reason text, last_polled_at timestamptz, items_read bigint
)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.homepage, s.series, s.enabled, s.paused_reason, s.last_polled_at,
    count(i.id) filter (
      where i.status = 'classified'
        and i.published_at > now() - make_interval(days => window_days)
        and i.published_at <= now() + interval '1 day'
    )
  from market_sources s
  left join market_items i on i.source_id = s.id
  where s.verdict <> 'red'
  group by s.id
  order by s.series, s.name;
$$;

revoke all on function market_tag_counts(integer), market_status(integer) from public;
grant execute on function market_tag_counts(integer), market_status(integer) to anon, authenticated;
