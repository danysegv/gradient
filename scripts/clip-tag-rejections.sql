-- ============================================================
-- A curator's correction outlives the next classifier run — 2026-09-17.
-- Applied via Supabase MCP.
--
-- WHY THIS EXISTS. On 09-17 Luma went through the library by eye and found
-- tags that were simply wrong: ExposedGrid on a knitwear campaign with no
-- grid in it, NeoSwiss on a photograph of a shopfront sign. Deleting those
-- clip_tags rows fixes nothing for long: the incubating classifier adds
-- whatever incubating tag a clip is missing, so the next Process press
-- writes them straight back, and the curator's judgement loses to the
-- model's silently.
--
-- clip_tag_rejections records "a person looked at this clip and said no to
-- this tag". A BEFORE INSERT trigger on clip_tags drops any write that
-- matches. It is a trigger and not a filter in the writer because there is
-- more than one writer (app/clip/classify-actions.ts, process-actions.ts,
-- clip creation, backfill scripts) and the next one will be written by
-- someone who has never read this file. The database is the only place
-- every writer has to pass through.
--
-- reject_clip_tag() does both halves at once: record the judgement, remove
-- the row. unreject_clip_tag() reverses it — a curator can change their
-- mind, and the classifier is then free to propose the tag again.
--
-- It does NOT prevent a person adding the tag by hand: an insert straight
-- into clip_tags is still blocked by the trigger, so unreject first. That
-- is deliberate — the rejection is the record of a decision, not a lock.
-- ============================================================

create table if not exists public.clip_tag_rejections (
  clip_id uuid not null references public.clips(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  rejected_at timestamptz not null default now(),
  note text,
  primary key (clip_id, tag_id)
);
alter table public.clip_tag_rejections enable row level security;
revoke all on public.clip_tag_rejections from public, anon, authenticated;

create or replace function public.skip_rejected_clip_tag()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from clip_tag_rejections r
    where r.clip_id = new.clip_id and r.tag_id = new.tag_id
  ) then
    return null;
  end if;
  return new;
end;
$function$;

drop trigger if exists clip_tags_skip_rejected on public.clip_tags;
create trigger clip_tags_skip_rejected
  before insert on public.clip_tags
  for each row execute function public.skip_rejected_clip_tag();

create or replace function public.reject_clip_tag(p_clip_id uuid, p_tag_name text, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tag uuid;
begin
  select id into v_tag from tags where editorial_name = p_tag_name;
  if v_tag is null then
    raise exception 'no tag named %', p_tag_name;
  end if;
  insert into clip_tag_rejections (clip_id, tag_id, note)
  values (p_clip_id, v_tag, p_note)
  on conflict (clip_id, tag_id) do update
    set note = coalesce(excluded.note, clip_tag_rejections.note),
        rejected_at = now();
  delete from clip_tags where clip_id = p_clip_id and tag_id = v_tag;
end;
$function$;
revoke execute on function public.reject_clip_tag(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reject_clip_tag(uuid, text, text) to service_role;

create or replace function public.unreject_clip_tag(p_clip_id uuid, p_tag_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tag uuid;
begin
  select id into v_tag from tags where editorial_name = p_tag_name;
  if v_tag is null then
    raise exception 'no tag named %', p_tag_name;
  end if;
  delete from clip_tag_rejections where clip_id = p_clip_id and tag_id = v_tag;
end;
$function$;
revoke execute on function public.unreject_clip_tag(uuid, text) from public, anon, authenticated;
grant execute on function public.unreject_clip_tag(uuid, text) to service_role;

-- Applied 2026-09-17, from Luma's review (all incubating, no figure moved):
--   Yeezy Season 1            ExposedGrid   no grid in the image
--   Marcello Morandini        NeoSwiss, ExposedGrid
--   Clarity Concepts          NeoSwiss, TypeOnly
--   Josef Müller-Brockmann    NeoSwiss
-- And three tags she found missing, added by hand at confidence 0.80:
--   Brain Magazine            NeoSwiss      (incubating)
--   The Realist               NeoMedieval   (PUBLISHED — moves a figure)
--   Ameyoko Market Street     LongExposure  (PUBLISHED — moves a figure)
