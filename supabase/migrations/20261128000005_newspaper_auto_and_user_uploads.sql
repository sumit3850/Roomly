-- ════════════════════════════════════════════════════════════════════
-- 0005: Newspaper archive — daily auto-download + uploads by any signed-in user
-- ════════════════════════════════════════════════════════════════════

-- Remove the hand-transcribed sample adverts (seed.sql, Nov 24/26/27) if they were loaded.
-- They are identifiable by having no PDF and no uploader.
delete from public.newspaper_publications
 where uploaded_by is null and pdf_path is null
   and newspaper = 'Daily Telegrams'
   and edition_date in ('2026-11-24', '2026-11-26', '2026-11-27');

-- Where an edition came from: the daily downloader ('auto') or a person ('upload')
alter table public.newspaper_publications
  add column if not exists source       text not null default 'upload' check (source in ('auto', 'upload')),
  add column if not exists source_url   text,
  add column if not exists source_files text[] not null default '{}',
  add column if not exists ad_count     int not null default 0,
  add column if not exists fetched_at   timestamptz;
create index if not exists publications_edition_idx on public.newspaper_publications (edition_date desc);

alter table public.newspaper_advertisements
  add column if not exists created_by uuid references auth.users (id) on delete set null;
create index if not exists ads_created_by_idx on public.newspaper_advertisements (created_by);

-- Keep ad_count in sync
create or replace function public.refresh_publication_ad_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare _pid uuid := coalesce(new.publication_id, old.publication_id);
begin
  update public.newspaper_publications
     set ad_count = (select count(*) from public.newspaper_advertisements where publication_id = _pid)
   where id = _pid;
  return null;
end $$;
drop trigger if exists ads_count_sync on public.newspaper_advertisements;
create trigger ads_count_sync after insert or delete on public.newspaper_advertisements
  for each row execute function public.refresh_publication_ad_count();
update public.newspaper_publications p
   set ad_count = (select count(*) from public.newspaper_advertisements a where a.publication_id = p.id);

-- Non-admin uploads are always 'upload' and attributed to the uploader
create or replace function public.guard_publication()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
    new.source := 'upload';
  else
    new.uploaded_by := old.uploaded_by;
    new.source := old.source;
  end if;
  return new;
end $$;
drop trigger if exists publications_guard on public.newspaper_publications;
create trigger publications_guard before insert or update on public.newspaper_publications
  for each row execute function public.guard_publication();

create or replace function public.guard_advertisement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  new.created_by := auth.uid();
  new.linked_property_id := null;
  return new;
end $$;
drop trigger if exists ads_guard on public.newspaper_advertisements;
create trigger ads_guard before insert on public.newspaper_advertisements
  for each row execute function public.guard_advertisement();

-- ─── RLS: signed-in users can add papers & adverts; manage only their own ───
drop policy if exists "publications: admin write" on public.newspaper_publications;
drop policy if exists "publications: user insert" on public.newspaper_publications;
create policy "publications: user insert" on public.newspaper_publications for insert to authenticated
  with check ((uploaded_by = auth.uid() and source = 'upload') or public.is_admin());
drop policy if exists "publications: owner update" on public.newspaper_publications;
create policy "publications: owner update" on public.newspaper_publications for update to authenticated
  using (uploaded_by = auth.uid() or public.is_admin()) with check (uploaded_by = auth.uid() or public.is_admin());
drop policy if exists "publications: owner delete" on public.newspaper_publications;
create policy "publications: owner delete" on public.newspaper_publications for delete to authenticated
  using ((uploaded_by = auth.uid() and source = 'upload') or public.is_admin());

drop policy if exists "ads: admin write" on public.newspaper_advertisements;
drop policy if exists "ads: user insert" on public.newspaper_advertisements;
create policy "ads: user insert" on public.newspaper_advertisements for insert to authenticated
  with check (
    (created_by = auth.uid() and not exists (select 1 from public.profiles where id = auth.uid() and is_suspended))
    or public.is_admin());
drop policy if exists "ads: owner/admin update" on public.newspaper_advertisements;
create policy "ads: owner/admin update" on public.newspaper_advertisements for update to authenticated
  using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
drop policy if exists "ads: owner/admin delete" on public.newspaper_advertisements;
create policy "ads: owner/admin delete" on public.newspaper_advertisements for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- ─── Storage: users upload papers under newspaper-pdfs/uploads/{uid}/… ───
drop policy if exists "newspaper: user upload" on storage.objects;
create policy "newspaper: user upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'newspaper-pdfs'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "newspaper: user delete own" on storage.objects;
create policy "newspaper: user delete own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'newspaper-pdfs'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text);
