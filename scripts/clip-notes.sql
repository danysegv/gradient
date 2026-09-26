-- Notes on clips (2026-09-25). Applied as migration `clip_notes`.
-- Public and signed with a curator's username. Readable by anyone; there
-- is no write policy — app/clip/note-actions.ts writes with the service
-- role after checking the curator session, and deletes only for the
-- author, the clip's curator, or an admin. A rename carries notes (ON
-- UPDATE CASCADE); deleting a clip or a profile takes its notes with it.
create table public.clip_notes (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  author_name text not null references public.profiles(name) on update cascade on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index clip_notes_clip_idx on public.clip_notes (clip_id, created_at);
alter table public.clip_notes enable row level security;
create policy "anyone reads notes" on public.clip_notes
  for select to anon, authenticated using (true);
grant select on public.clip_notes to anon, authenticated;

-- Replies (2026-09-25, migration `clip_notes_replies`): one level deep.
-- app/clip/note-actions.ts points a reply-to-a-reply at its thread's top.
alter table public.clip_notes
  add column parent_id uuid references public.clip_notes(id) on delete cascade;
create index clip_notes_parent_idx on public.clip_notes (parent_id);
