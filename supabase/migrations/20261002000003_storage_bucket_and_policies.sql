-- ==============================================================================
-- ETHNOIR Return & Replacement Application
-- Migration 03: Storage Bucket & Policies
-- Brand: ETHNOIR (ethnoirindia.myshopify.com)
-- ==============================================================================

-- Create private bucket 'return-images' with 5MB limit and restricted image MIME types
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'return-images',
  'return-images',
  false,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

-- Customers can view photos only for their own return requests
CREATE POLICY "Customers can view their return photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'return-images'
  AND EXISTS (
    SELECT 1 FROM public.uploaded_files uf
    JOIN public.return_requests rr ON rr.id = uf.return_request_id
    WHERE uf.storage_path = storage.objects.name
      AND (rr.customer_id = auth.uid()::text OR rr.customer_email = (auth.jwt() ->> 'email'))
  )
);

-- Active Admins have full access to return images storage
CREATE POLICY "Admins have full access to return images storage"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'return-images'
  AND public.is_active_admin()
)
WITH CHECK (
  bucket_id = 'return-images'
  AND public.is_active_admin()
);

-- Upload validation policy: Restrict to valid image extensions and explicitly block executable types
CREATE POLICY "Block executable and dangerous uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'return-images'
  AND (storage.extension(name) = ANY (ARRAY['jpg', 'jpeg', 'png', 'webp', 'heic']))
  AND NOT (storage.extension(name) = ANY (ARRAY['exe', 'bat', 'sh', 'php', 'js', 'msi', 'cmd', 'vbs', 'ps1', 'jar']))
);
