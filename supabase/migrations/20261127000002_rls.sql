-- ════════════════════════════════════════════════════════════════════
-- 0002: Row Level Security policies
-- Principle: deny by default; owners manage their own rows; admins via is_admin().
-- ════════════════════════════════════════════════════════════════════
alter table public.profiles                 enable row level security;
alter table public.user_roles               enable row level security;
alter table public.property_categories      enable row level security;
alter table public.properties               enable row level security;
alter table public.property_images          enable row level security;
alter table public.property_locations       enable row level security;
alter table public.amenities                enable row level security;
alter table public.property_amenities       enable row level security;
alter table public.property_enquiries       enable row level security;
alter table public.saved_properties         enable row level security;
alter table public.property_reviews         enable row level security;
alter table public.newspaper_publications   enable row level security;
alter table public.newspaper_advertisements enable row level security;
alter table public.notifications            enable row level security;
alter table public.user_reports             enable row level security;
alter table public.rental_transactions      enable row level security;

-- Helper: is a property publicly visible?
create or replace function public.property_is_public(_property_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.properties where id = _property_id and status in ('active', 'rented'));
$$;
create or replace function public.owns_property(_property_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.properties where id = _property_id and owner_id = auth.uid());
$$;

-- ─── profiles ───────────────────────────────────────────────────────
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
-- Owners may see the contact profile of tenants who enquired with them
drop policy if exists "profiles: owners see enquirers" on public.profiles;
create policy "profiles: owners see enquirers" on public.profiles for select to authenticated
  using (exists (select 1 from public.property_enquiries e where e.tenant_id = profiles.id and e.owner_id = auth.uid()));
-- (inserts happen only through the handle_new_user trigger)

-- ─── user_roles ─────────────────────────────────────────────────────
drop policy if exists "roles: read own" on public.user_roles;
create policy "roles: read own" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- writes only through set_self_role() / admin_set_role() (SECURITY DEFINER)

-- ─── reference data ────────────────────────────────────────────────
drop policy if exists "categories: public read" on public.property_categories;
create policy "categories: public read" on public.property_categories for select using (true);
drop policy if exists "categories: admin write" on public.property_categories;
create policy "categories: admin write" on public.property_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "amenities: public read" on public.amenities;
create policy "amenities: public read" on public.amenities for select using (true);
drop policy if exists "amenities: admin write" on public.amenities;
create policy "amenities: admin write" on public.amenities for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── properties ────────────────────────────────────────────────────
drop policy if exists "properties: public read" on public.properties;
create policy "properties: public read" on public.properties for select
  using (status in ('active', 'rented') or owner_id = auth.uid() or public.is_admin());
drop policy if exists "properties: owner insert" on public.properties;
create policy "properties: owner insert" on public.properties for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (public.has_role(auth.uid(), 'owner') or public.has_role(auth.uid(), 'commercial_owner') or public.is_admin())
  );
drop policy if exists "properties: owner update" on public.properties;
create policy "properties: owner update" on public.properties for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists "properties: owner delete" on public.properties;
create policy "properties: owner delete" on public.properties for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- ─── property children (images, location, amenities) ──────────────
drop policy if exists "images: read" on public.property_images;
create policy "images: read" on public.property_images for select
  using (public.property_is_public(property_id) or public.owns_property(property_id) or public.is_admin());
drop policy if exists "images: owner write" on public.property_images;
create policy "images: owner write" on public.property_images for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (
    (public.owns_property(property_id) and split_part(storage_path, '/', 1) = auth.uid()::text)
    or public.is_admin());

drop policy if exists "locations: read" on public.property_locations;
create policy "locations: read" on public.property_locations for select
  using (public.property_is_public(property_id) or public.owns_property(property_id) or public.is_admin());
drop policy if exists "locations: owner write" on public.property_locations;
create policy "locations: owner write" on public.property_locations for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

drop policy if exists "prop amenities: read" on public.property_amenities;
create policy "prop amenities: read" on public.property_amenities for select
  using (public.property_is_public(property_id) or public.owns_property(property_id) or public.is_admin());
drop policy if exists "prop amenities: owner write" on public.property_amenities;
create policy "prop amenities: owner write" on public.property_amenities for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

-- ─── enquiries ─────────────────────────────────────────────────────
drop policy if exists "enquiries: parties read" on public.property_enquiries;
create policy "enquiries: parties read" on public.property_enquiries for select to authenticated
  using (tenant_id = auth.uid() or owner_id = auth.uid() or public.is_admin());
drop policy if exists "enquiries: tenant create" on public.property_enquiries;
create policy "enquiries: tenant create" on public.property_enquiries for insert to authenticated
  with check (
    tenant_id = auth.uid()
    and not exists (select 1 from public.profiles where id = auth.uid() and is_suspended));
drop policy if exists "enquiries: parties update" on public.property_enquiries;
create policy "enquiries: parties update" on public.property_enquiries for update to authenticated
  using (tenant_id = auth.uid() or owner_id = auth.uid() or public.is_admin())
  with check (tenant_id = auth.uid() or owner_id = auth.uid() or public.is_admin());
drop policy if exists "enquiries: tenant delete" on public.property_enquiries;
create policy "enquiries: tenant delete" on public.property_enquiries for delete to authenticated
  using (tenant_id = auth.uid() or public.is_admin());

-- ─── saved_properties ──────────────────────────────────────────────
drop policy if exists "saved: own" on public.saved_properties;
create policy "saved: own" on public.saved_properties for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── reviews ───────────────────────────────────────────────────────
drop policy if exists "reviews: public read" on public.property_reviews;
create policy "reviews: public read" on public.property_reviews for select using (true);
-- Only people who actually engaged (enquired or rented) may review
drop policy if exists "reviews: engaged users create" on public.property_reviews;
create policy "reviews: engaged users create" on public.property_reviews for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and (
      exists (select 1 from public.property_enquiries e where e.property_id = property_reviews.property_id and e.tenant_id = auth.uid())
      or exists (select 1 from public.rental_transactions t where t.property_id = property_reviews.property_id and t.tenant_id = auth.uid())
    ));
drop policy if exists "reviews: author update" on public.property_reviews;
create policy "reviews: author update" on public.property_reviews for update to authenticated
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
drop policy if exists "reviews: author/admin delete" on public.property_reviews;
create policy "reviews: author/admin delete" on public.property_reviews for delete to authenticated
  using (reviewer_id = auth.uid() or public.is_admin());

-- ─── newspaper archive: public read, admin write ───────────────────
drop policy if exists "publications: public read" on public.newspaper_publications;
create policy "publications: public read" on public.newspaper_publications for select using (true);
drop policy if exists "publications: admin write" on public.newspaper_publications;
create policy "publications: admin write" on public.newspaper_publications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ads: public read" on public.newspaper_advertisements;
create policy "ads: public read" on public.newspaper_advertisements for select using (true);
drop policy if exists "ads: admin write" on public.newspaper_advertisements;
create policy "ads: admin write" on public.newspaper_advertisements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── notifications ─────────────────────────────────────────────────
drop policy if exists "notifications: own read" on public.notifications;
create policy "notifications: own read" on public.notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "notifications: own update" on public.notifications;
create policy "notifications: own update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications: own delete" on public.notifications;
create policy "notifications: own delete" on public.notifications for delete to authenticated
  using (user_id = auth.uid());
drop policy if exists "notifications: admin insert" on public.notifications;
create policy "notifications: admin insert" on public.notifications for insert to authenticated
  with check (public.is_admin());

-- ─── user_reports ──────────────────────────────────────────────────
drop policy if exists "reports: create" on public.user_reports;
create policy "reports: create" on public.user_reports for insert
  with check (
    (auth.uid() is not null and reporter_id = auth.uid())
    or (auth.uid() is null and reporter_id is null and reason = 'support' and reporter_email is not null));
drop policy if exists "reports: read own or admin" on public.user_reports;
create policy "reports: read own or admin" on public.user_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists "reports: admin update" on public.user_reports;
create policy "reports: admin update" on public.user_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "reports: admin delete" on public.user_reports;
create policy "reports: admin delete" on public.user_reports for delete to authenticated
  using (public.is_admin());

-- ─── rental_transactions ───────────────────────────────────────────
drop policy if exists "tx: parties read" on public.rental_transactions;
create policy "tx: parties read" on public.rental_transactions for select to authenticated
  using (owner_id = auth.uid() or tenant_id = auth.uid() or public.is_admin());
drop policy if exists "tx: owner write" on public.rental_transactions;
create policy "tx: owner write" on public.rental_transactions for all to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

-- ─── Grants ────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select on public.property_listings, public.public_profiles to anon, authenticated;
grant execute on function public.increment_property_view(uuid) to anon, authenticated;
grant execute on function public.identity_exists(text, text) to anon, authenticated;
grant execute on function public.set_self_role(public.app_role, boolean) to authenticated;
grant execute on function public.mark_property_rented(uuid, text, uuid, uuid, date) to authenticated;
grant execute on function public.relist_property(uuid) to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.admin_stats() to authenticated;
revoke execute on function public.set_self_role(public.app_role, boolean) from anon;
revoke execute on function public.mark_property_rented(uuid, text, uuid, uuid, date) from anon;
revoke execute on function public.relist_property(uuid) from anon;
revoke execute on function public.admin_set_role(uuid, public.app_role, boolean) from anon;
revoke execute on function public.admin_stats() from anon;

-- Realtime for in-app notifications
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;
