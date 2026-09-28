-- One sign-in across the site and the browser extension (2026-09-27).
--
-- The site (cookies) and the extension (bearer tokens) each hold their own
-- Supabase Auth session. When one is made from the other — the extension
-- picking up the site's sign-in, or the site picking up the extension's —
-- the two session ids are recorded here as a pair, and signing out of
-- either ends the other. Before this, the extension stayed signed in after
-- the site signed out, and a clip could be saved "before logging in".
--
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. A token only counts while its session exists. Supabase access tokens
--    stay valid for up to an hour after sign-out; checking the session row
--    makes a sign-out (here, or a paired one) take effect at once. Also
--    returns user_id and session_id, which the pairing needs.
drop function if exists public.my_curator_profile();
create function public.my_curator_profile()
returns table(name text, login_key text, is_admin boolean, user_id uuid, session_id uuid)
language sql stable security definer
set search_path = public
as $$
  select p.name, p.login_key, p.is_admin, p.user_id, s.id
  from profiles p
  join auth.sessions s
    on s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
   and s.user_id = p.user_id
  where p.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
$$;
revoke all on function public.my_curator_profile() from public, anon;
grant execute on function public.my_curator_profile() to authenticated, service_role;

-- 2. The pairs. Service role only (RLS on, no policies).
create table if not exists public.session_pairs (
  site_session uuid not null,
  ext_session  uuid not null,
  user_id      uuid not null,
  created_at   timestamptz not null default now(),
  primary key (site_session, ext_session)
);
alter table public.session_pairs enable row level security;

-- 3. Ending one side ends the other.
create or replace function public.end_paired_sessions(p_session uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  with partners as (
    select ext_session as id from session_pairs where site_session = p_session
    union
    select site_session from session_pairs where ext_session = p_session
  ), gone as (
    delete from auth.sessions s using partners where s.id = partners.id returning 1
  )
  select count(*) into n from gone;
  delete from session_pairs where site_session = p_session or ext_session = p_session;
  return n;
end
$$;
revoke all on function public.end_paired_sessions(uuid) from public, anon, authenticated;
grant execute on function public.end_paired_sessions(uuid) to service_role;
