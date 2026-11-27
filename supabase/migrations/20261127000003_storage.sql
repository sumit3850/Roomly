-- ════════════════════════════════════════════════════════════════════
-- 0003: Storage buckets + policies
-- Path conventions:
--   property-images/{user_id}/{property_id}/{file}
--   profile-images/{user_id}/{file}
--   property-documents/{user_id}/{property_id}/{file}   (private)
--   newspaper-pdfs/{yyyy-mm-dd}/{file}                  (admin write)
--   newspaper-extracted-pages/{publication_id}/{file}   (admin write)
-- ════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('property-images',           'property-images',           true,  5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('profile-images',            'profile-images',            true,  2097152,  array['image/jpeg', 'image/png', 'image/webp']),
  ('newspaper-pdfs',            'newspaper-pdfs',            true,  52428800, array['application/pdf', 'text/plain']),
  ('newspaper-extracted-pages', 'newspaper-extracted-pages', true,  10485760, array['image/jpeg', 'image/png', 'image/webp', 'text/plain']),
  ('property-documents',        'property-documents',        false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- property-images ------------------------------------------------------
drop policy if exists "property-images: public read" on storage.objects;
create policy "property-images: public read" on storage.objects for select
  using (bucket_id = 'property-images');
drop policy if exists "property-images: owner insert" on storage.objects;
create policy "property-images: owner insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'property-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.owns_property(((storage.foldername(name))[2])::uuid));
drop policy if exists "property-images: owner update" on storage.objects;
create policy "property-images: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'property-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "property-images: owner delete" on storage.objects;
create policy "property-images: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- profile-images -------------------------------------------------------
drop policy if exists "profile-images: public read" on storage.objects;
create policy "profile-images: public read" on storage.objects for select
  using (bucket_id = 'profile-images');
drop policy if exists "profile-images: own write" on storage.objects;
create policy "profile-images: own write" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "profile-images: own update" on storage.objects;
create policy "profile-images: own update" on storage.objects for update to authenticated
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "profile-images: own delete" on storage.objects;
create policy "profile-images: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- property-documents (private) -----------------------------------------
drop policy if exists "property-documents: own read" on storage.objects;
create policy "property-documents: own read" on storage.objects for select to authenticated
  using (bucket_id = 'property-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "property-documents: own write" on storage.objects;
create policy "property-documents: own write" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "property-documents: own delete" on storage.objects;
create policy "property-documents: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- newspaper buckets (public read, admin write) -------------------------
drop policy if exists "newspaper: public read" on storage.objects;
create policy "newspaper: public read" on storage.objects for select
  using (bucket_id in ('newspaper-pdfs', 'newspaper-extracted-pages'));
drop policy if exists "newspaper: admin insert" on storage.objects;
create policy "newspaper: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('newspaper-pdfs', 'newspaper-extracted-pages') and public.is_admin());
drop policy if exists "newspaper: admin update" on storage.objects;
create policy "newspaper: admin update" on storage.objects for update to authenticated
  using (bucket_id in ('newspaper-pdfs', 'newspaper-extracted-pages') and public.is_admin());
drop policy if exists "newspaper: admin delete" on storage.objects;
create policy "newspaper: admin delete" on storage.objects for delete to authenticated
  using (bucket_id in ('newspaper-pdfs', 'newspaper-extracted-pages') and public.is_admin());
