-- Applied 2026-09-14, REVERSED 2026-09-15. Curator profile pictures.
--
-- What this file did: created a public `avatars` storage bucket so curators
-- could upload a picture of themselves, alongside a display_name distinct
-- from their username.
--
-- What happened: pictures and display names were built, looked at, and taken
-- back out the next day. Two reasons, and the second is the durable one:
--
--   1. Nothing generated — marks derived from a curator's own signature —
--      looked like it belonged next to the work. An uploaded picture of
--      anyone's choosing was the other option, and it reads as a social
--      network rather than as a library.
--   2. display_name gave a curator two names. The username is the name in
--      clips.clipped_by_name, in every credit, in every URL, and in the
--      §512 attribution chain (see 04am-rights-posture-2026-09-12.md, item
--      5: per-clip attribution of who clipped it must survive the move to
--      accounts). A second, freely-editable name floating over that is a
--      liability dressed as a feature.
--
-- So a curator writes one thing about themselves — profiles.bio — and is
-- called by their username everywhere. The reversal, applied 2026-09-15:

update storage.buckets
   set public = false,
       allowed_mime_types = null,
       file_size_limit = 0
 where id = 'avatars';

-- The bucket row itself could NOT be removed from here: storage.protect_delete()
-- raises 42501 on any direct delete from storage.buckets or storage.objects,
-- by design — the Storage API is the only way. The bucket holds zero objects
-- (verified before the update above), nothing in the app writes to it, and it
-- is now private with a zero byte limit and no permitted MIME types, so it is
-- inert either way. Remove it properly in the Supabase dashboard:
-- Storage → avatars → Delete bucket.

-- profiles.display_name and profiles.avatar_path are LEFT IN PLACE, nullable
-- and unread. Dropping columns is the one schema change that cannot be undone
-- without the data, and pictures are a Phase-2 decision, not a closed one.
-- Nothing in the app selects them: lib/profiles/queries.ts selects exactly
-- "name, bio". If they are still unread by the time accounts land, drop them
-- then, in the same migration that reshapes profiles around real identity.
