-- Migration: Add Logo Storage Bucket
-- Created: 2026-03-10
-- Description: Create storage bucket for organization logos with proper policies

-- Create storage bucket for logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logos" ON storage.objects;

-- Create storage policies
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logos');

CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'logos');

CREATE POLICY "Authenticated users can update logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'logos');

CREATE POLICY "Authenticated users can delete logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'logos');

-- Update company_info to include phone and email fields if not exists
UPDATE t_settings 
SET value = jsonb_set(
  jsonb_set(
    COALESCE(value, '{}'::jsonb),
    '{phone}', 
    COALESCE(value->'phone', '"021-12345678"'::jsonb)
  ),
  '{email}', 
  COALESCE(value->'email', '"info@jaspel.co.id"'::jsonb)
)
WHERE key = 'company_info' 
  AND (value->>'phone' IS NULL OR value->>'email' IS NULL);
