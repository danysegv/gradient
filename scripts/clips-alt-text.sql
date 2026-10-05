-- Alt text for clip images. Applied 2026-10-05 as migration `clips_alt_text`,
-- then backfilled with the statement below (251 clips). See lib/clips/alt-text.ts
-- and the 2026-10-05 entry in CLAUDE.md's decisions log.

alter table public.clips add column if not exists alt_text text;
comment on column public.clips.alt_text is 'Alt text for the image: the first sentence of the clip''s description (lib/clips/alt-text.ts). Public. Written by lib/claude/describe-clip.ts. Decided 2026-10-05.';

-- Backfill: the same rule as altFromSummary() in lib/clips/alt-text.ts.
-- Verified on 2026-10-05: md5 over every (clip_id:alt) pair matched the TS
-- function's output exactly (24d48dd9a5edaa272130fc3c4e891984, 251 rows).
with s as (select clip_id, regexp_replace(btrim(summary), '\s+', ' ', 'g') t from clip_descriptions),
f as (select clip_id, btrim(coalesce(substring(t from '^(.+?[.!?])(?=\s+["''“(]?[A-Z0-9]|$)'), t)) first from s),
a as (select clip_id, case when length(first) <= 250 then first
  else regexp_replace(regexp_replace(left(first,250), ' [^ ]*$', ''), '[\s,;:–—-]+$', '') || '…' end alt from f)
update public.clips c set alt_text = a.alt from a where c.id = a.clip_id and a.alt <> '';
