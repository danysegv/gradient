-- ============================================================
-- Profiles and boards — 2026-09-11. Applied via Supabase MCP.
--
-- Purely additive. Nothing here is read by any metric, RPC or velocity
-- path. A board POINTS AT clips; saving a clip to a board never creates a
-- clip and never creates a tag application, so a clip saved to five
-- boards is still one reference in every figure.
--
-- profiles  — one row per curator NAME (the public display layer: display
--             name, bio, avatar). Not curator_identities, which maps names
--             to PEOPLE for the panel gate and stays unreadable by anon.
-- boards    — owned by a profile. Private by default.
-- board_clips — which clips are on which board. Any clip in the library,
--             not only the owner's; the clip stays credited to whoever
--             clipped it.
--
-- Writes: service role only, through server actions that verify the
-- /clip session cookie AND that the session's curator owns the board.
-- Reads: anon sees profiles, public boards, and the clips on public
-- boards. Private boards are read with the service role, and only when
-- the session curator is the owner.
-- ============================================================

create table public.profiles (
  name          text primary key check (name ~ '^[a-z0-9_.-]{2,40}$'),
  display_name  text check (char_length(display_name) <= 60),
  bio           text check (char_length(bio) <= 280),
  avatar_path   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One profile per configured curator. Seeded from curator_identities,
-- which carries every configured name (including veronagarcia, who has
-- not clipped yet).
insert into public.profiles (name)
select name from public.curator_identities
on conflict (name) do nothing;

create table public.boards (
  id           uuid primary key default gen_random_uuid(),
  owner_name   text not null references public.profiles(name)
                 on update cascade on delete restrict,
  slug         text not null check (
                 slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  description  text check (char_length(description) <= 500),
  is_public    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (owner_name, slug)
);
create index boards_owner_name_idx on public.boards (owner_name);

create table public.board_clips (
  board_id  uuid not null references public.boards(id) on delete cascade,
  clip_id   uuid not null references public.clips(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (board_id, clip_id)
);
create index board_clips_clip_id_idx on public.board_clips (clip_id);

alter table public.profiles    enable row level security;
alter table public.boards      enable row level security;
alter table public.board_clips enable row level security;

-- Supabase's default privileges grant every table's writes to anon and
-- authenticated. RLS with no write policy already refuses them; revoking
-- as well means a future permissive policy can't quietly open writes.
revoke insert, update, delete, truncate on public.profiles    from anon, authenticated;
revoke insert, update, delete, truncate on public.boards      from anon, authenticated;
revoke insert, update, delete, truncate on public.board_clips from anon, authenticated;

create policy "public read profiles" on public.profiles
  for select to anon, authenticated using (true);

create policy "public read public boards" on public.boards
  for select to anon, authenticated using (is_public);

create policy "public read clips on public boards" on public.board_clips
  for select to anon, authenticated using (
    exists (select 1 from public.boards b where b.id = board_id and b.is_public)
  );
