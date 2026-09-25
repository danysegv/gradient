-- Following curators (2026-09-25). Applied as migration `follows`.
--
-- A follow belongs to an ACCOUNT (Supabase Auth user), not a curator
-- session: any signed-in person can follow, and legacy password curators
-- simply don't follow until they link an account.
--
-- It points at profiles.name with ON UPDATE CASCADE: rename_curator
-- UPDATEs the name in place, so a rename carries every follow with it.
-- RLS: you see, add and remove only your own rows; nobody else can read
-- who follows whom. You cannot follow the profile linked to your own
-- account.

create table public.follows (
  follower_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  curator_name text not null references public.profiles(name) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, curator_name)
);
create index follows_curator_idx on public.follows (curator_name);

alter table public.follows enable row level security;

create policy "read own follows" on public.follows
  for select to authenticated using (follower_id = auth.uid());
create policy "follow as yourself" on public.follows
  for insert to authenticated with check (
    follower_id = auth.uid()
    and not exists (select 1 from public.profiles p where p.name = curator_name and p.user_id = auth.uid())
  );
create policy "unfollow your own" on public.follows
  for delete to authenticated using (follower_id = auth.uid());

revoke all on public.follows from anon;
grant select, insert, delete on public.follows to authenticated;
