-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Stream Overlay logo uploads: a public Storage bucket so a supporter can
-- upload an event or sponsor logo from the panel instead of hosting it
-- somewhere themselves. Files live under the uploader's own folder
-- (`<user id>/<timestamp>-<name>`); anyone can read (the OBS view has no
-- session), only the signed-in owner of a folder can write into it.
-- See CLAUDE.md "Stream Overlay".

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('stream-logos', 'stream-logos', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY stream_logos_owner_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stream-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
