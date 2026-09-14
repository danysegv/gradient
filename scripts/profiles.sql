-- Applied 2026-09-14. Curator profile pictures, display names and bios.
--
-- The profiles table and its columns already existed (scripts/profiles-and-boards.sql,
-- 2026-09-11); nothing used them. This adds the storage side.
--
-- Public bucket: curator identity was decided public on 2026-09-11, and an
-- avatar is shown on pages anyone can read, so there is nothing to gate.
-- Writes do NOT go through storage RLS — curators are shared-secret sessions,
-- not Supabase Auth users, so there is no auth.uid() for a policy to check.
-- app/clip/profile-actions.ts uploads with the service role and takes the
-- curator from the session cookie, never from the form, so a submitted name
-- cannot be used to overwrite someone else's picture.
--
-- One avatar per curator: the object key is the curator's name plus an
-- extension derived from the MIME type (never from the uploaded filename),
-- so re-uploading replaces rather than accumulating. Changing format leaves
-- the old extension behind, which profile-actions removes explicitly.
--
-- The public URL is therefore stable, which would let a CDN keep serving a
-- replaced image — lib/profiles/queries.ts hangs profiles.updated_at off it
-- as a cache-buster.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
