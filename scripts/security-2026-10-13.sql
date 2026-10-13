-- Security review 2026-10-13. Run in Supabase → SQL Editor AFTER the
-- matching commit has deployed (lib/profiles/queries.ts must already read
-- with the service role, or curator pages lose their bios until it does).
-- Safe to run more than once.

-- ---------------------------------------------------------------------
-- #1 / #7 (applied by hand on 10-13; kept here so the repo has it):
-- the public roles only read; every write goes through server code.
-- ---------------------------------------------------------------------
drop policy if exists "authenticated insert clips" on public.clips;
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant insert, delete on public.follows to authenticated;
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;

-- ---------------------------------------------------------------------
-- #5: counting sign-in / sign-up / reset attempts (lib/auth/attempts.ts).
-- Buckets are hashes, never an address or an email. Service role only.
-- ---------------------------------------------------------------------
create table if not exists public.auth_attempts (
  id bigint generated always as identity primary key,
  bucket text not null,
  at timestamptz not null default now()
);
create index if not exists auth_attempts_bucket_at on public.auth_attempts (bucket, at);
create index if not exists auth_attempts_at on public.auth_attempts (at);
alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;

create or replace function public.take_auth_attempt(p_bucket text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  -- Nothing older than a day is ever needed.
  delete from auth_attempts where at < now() - interval '1 day';
  select count(*) into n
    from auth_attempts
   where bucket = p_bucket
     and at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then
    return false;
  end if;
  insert into auth_attempts (bucket) values (p_bucket);
  return true;
end;
$$;
revoke execute on function public.take_auth_attempt(text, int, int) from public, anon, authenticated;
grant execute on function public.take_auth_attempt(text, int, int) to service_role;

-- ---------------------------------------------------------------------
-- #9: the public reads only what a profile page shows. Account ids, the
-- admin flag and login keys are server-only from here on.
-- ---------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant select (name, display_name, bio, avatar_path, created_at, updated_at)
  on public.profiles to anon, authenticated;

revoke select on public.profile_name_history from anon, authenticated;
grant select (old_name, changed_at) on public.profile_name_history to anon, authenticated;

-- clips.clipped_by is residue of the reverted Aug auth experiment and holds
-- an account id on 10 rows. Every other column stays public.
revoke select on public.clips from anon, authenticated;
grant select (id, url, image_url, title, source, caption, clipped_at, created_at,
              archived_at, clipped_by_name, archived_by_name, creator, rights_holder,
              found_via, source_year, attribution_parsed_at, alt_text)
  on public.clips to anon, authenticated;

-- "Follow as yourself" checked profiles.user_id as the signed-in user, who
-- can no longer read that column. Same rule, asked of a function that can.
create or replace function public.is_my_profile(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where name = p_name and user_id = (select auth.uid()));
$$;
revoke execute on function public.is_my_profile(text) from public, anon;
grant execute on function public.is_my_profile(text) to authenticated;

drop policy if exists "follow as yourself" on public.follows;
create policy "follow as yourself" on public.follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()) and not public.is_my_profile(curator_name));

-- #8 while here: trigger functions don't belong on the public API.
revoke execute on function public.market_apply_optout() from public, anon, authenticated;
revoke execute on function public.skip_rejected_clip_tag() from public, anon, authenticated;
