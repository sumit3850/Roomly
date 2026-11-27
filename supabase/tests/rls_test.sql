-- RLS / authorization regression tests. Run against a NON-production database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Everything runs in a transaction that is rolled back.
begin;
create or replace function pg_temp.act_as(_uid uuid) returns void language plpgsql as $$
begin
  if _uid is null then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', 'anon', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claim.sub', _uid::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
  end if;
end $$;
create or replace function pg_temp.expect(_ok boolean, _msg text) returns void language plpgsql as $$
begin
  if not _ok then raise exception 'FAIL: %', _msg; end if;
  raise notice 'PASS: %', _msg;
end $$;

-- users (as superuser: simulate Supabase Auth sign-ups)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@test.local',  '{"full_name":"Owner A","account_type":"owner"}'),
  ('00000000-0000-0000-0000-00000000000b', 'owner2@test.local', '{"full_name":"Owner B","account_type":"commercial_owner"}'),
  ('00000000-0000-0000-0000-00000000000c', 'tenant@test.local', '{"full_name":"Tenant C","account_type":"tenant"}'),
  ('00000000-0000-0000-0000-00000000000d', 'sneaky@test.local', '{"full_name":"Sneaky","account_type":"admin"}');
insert into auth.users (id, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', '919800000001', '{"full_name":"Phone User","account_type":"owner"}');

select pg_temp.expect((select count(*) from public.profiles where id::text like '00000000-0000-0000-0000-00000000000%') = 5, 'profiles auto-created for every new auth user');
select pg_temp.expect((select phone from public.profiles where id = '00000000-0000-0000-0000-00000000000e') = '+919800000001', 'phone sign-up stores E.164 phone on profile');
select pg_temp.expect(public.has_role('00000000-0000-0000-0000-00000000000a', 'owner') and public.has_role('00000000-0000-0000-0000-00000000000a', 'tenant'), 'owner gets owner + tenant roles');
select pg_temp.expect(not public.has_role('00000000-0000-0000-0000-00000000000d', 'admin'), 'admin cannot be self-selected at sign-up');

-- owner A creates a listing
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.properties (id, owner_id, title, configuration, rent_amount, is_verified, views_count)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '2 BHK near Dollygunj PO', '2 BHK', 12000, true, 999);
insert into public.property_locations (property_id, area, latitude, longitude) values ('10000000-0000-0000-0000-000000000001', 'Dollygunj', 11.64, 92.71);
select pg_temp.expect((select not is_verified and views_count = 0 from public.properties where id = '10000000-0000-0000-0000-000000000001'), 'owner cannot self-verify or fake views');

do $$ begin
  insert into public.properties (owner_id, title, configuration, rent_amount) values ('00000000-0000-0000-0000-00000000000a', '2 BHK near Dollygunj PO', '2 BHK', 1);
  raise exception 'FAIL: duplicate listing allowed';
exception when unique_violation then raise notice 'PASS: duplicate live listing title blocked'; end $$;

-- owner B cannot modify A's listing
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
update public.properties set rent_amount = 1 where id = '10000000-0000-0000-0000-000000000001';
delete from public.properties where id = '10000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect((select rent_amount = 12000 from public.properties where id = '10000000-0000-0000-0000-000000000001'), 'other users cannot edit or delete someone else''s listing');

-- tenant cannot create listings without an owner role
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  insert into public.properties (owner_id, title, configuration, rent_amount) values ('00000000-0000-0000-0000-00000000000c', 'Tenant tries listing', '1 BHK', 5000);
  raise exception 'FAIL: tenant-only user could list';
exception when insufficient_privilege then raise notice 'PASS: tenant-only account cannot publish listings'; end $$;
do $$ begin
  perform public.set_self_role('admin', true);
  raise exception 'FAIL: self-admin allowed';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: users cannot grant themselves admin';
end $$;
do $$ begin
  insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000c', 'admin');
  raise exception 'FAIL: direct role insert allowed';
exception when insufficient_privilege then raise notice 'PASS: user_roles not directly writable'; end $$;

-- tenant: browse, save, enquire
select pg_temp.expect((select count(*) from public.property_listings where id = '10000000-0000-0000-0000-000000000001') = 1, 'tenant sees active listing via property_listings view');
insert into public.saved_properties (user_id, property_id) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001');
insert into public.property_enquiries (property_id, tenant_id, owner_id, message)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'Is it still available?');
select pg_temp.expect((select owner_id = '00000000-0000-0000-0000-00000000000a' from public.property_enquiries limit 1), 'enquiry owner_id derived from property (not spoofable)');
select pg_temp.expect((select count(*) from public.profiles) = 1, 'tenant can only read own profile');
do $$ begin
  insert into public.property_reviews (property_id, reviewer_id, rating) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 5);
  raise notice 'PASS: engaged tenant can review';
end $$;
select pg_temp.expect((select not is_verified_tenant from public.property_reviews limit 1), 'review not verified without rental');

-- owner B can't see the enquiry; owner A can and responds
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.property_enquiries) = 0, 'unrelated owner cannot read enquiries');
select pg_temp.expect((select count(*) from public.saved_properties) = 0, 'saved properties are private');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
update public.property_enquiries set owner_response = 'Yes, visit Sunday', message = 'tampered';
select pg_temp.expect((select status = 'responded' and message = 'Is it still available?' from public.property_enquiries limit 1), 'owner can respond but not alter tenant message');
select pg_temp.expect((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 1, 'owner can see enquirer contact profile');
select public.mark_property_rented('10000000-0000-0000-0000-000000000001', null, '00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select status = 'rented' from public.properties where id = '10000000-0000-0000-0000-000000000001'), 'owner can mark property rented');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
update public.property_reviews set rating = 4;
select pg_temp.expect((select is_verified_tenant from public.property_reviews limit 1), 'review becomes verified after rental transaction');
select pg_temp.expect((select count(*) from public.notifications where type = 'enquiry_response') = 1, 'tenant notified of owner response');
update public.profiles set verification_status = 'verified', is_suspended = true where id = auth.uid();
select pg_temp.expect((select verification_status = 'unverified' and not is_suspended from public.profiles where id = auth.uid()), 'user cannot self-verify profile');

-- anonymous visitor
select pg_temp.act_as(null);
select pg_temp.expect((select count(*) from public.property_listings) = 1, 'anonymous can browse public listings');
select pg_temp.expect((select count(*) from public.profiles) = 0, 'anonymous cannot read profiles');
select pg_temp.expect((select count(*) from public.property_enquiries) = 0, 'anonymous cannot read enquiries');
select pg_temp.expect((select count(*) from public.notifications) = 0, 'anonymous cannot read notifications');
insert into public.user_reports (reason, reporter_email, details) values ('support', 'visitor@test.local', 'How do I list?');
do $$ begin
  perform public.admin_stats();
  raise exception 'FAIL: anon got admin stats';
exception when insufficient_privilege or raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: admin RPCs refuse non-admins';
end $$;

-- admin granted via backend
reset role;
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000d', 'admin');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select (public.admin_stats() ->> 'users')::int) >= 5, 'admin can read stats');
update public.properties set is_verified = true where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect((select is_verified from public.properties where id = '10000000-0000-0000-0000-000000000001'), 'admin can verify listings');

-- storage
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('property-images', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000001/x.jpg');
  raise exception 'FAIL: wrote into another user''s folder';
exception when insufficient_privilege then raise notice 'PASS: cannot upload into another owner''s image folder'; end $$;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name) values ('property-images', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000001/x.jpg');
select pg_temp.expect(true, 'owner can upload images for own property');

-- newspaper archive: any signed-in user can upload; only own uploads are editable
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
insert into public.newspaper_publications (id, name, edition_date, source, uploaded_by)
values ('20000000-0000-0000-0000-000000000001', 'Daily Telegrams — test', '2026-11-20', 'auto', '00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select source = 'upload' and uploaded_by = auth.uid() from public.newspaper_publications where id = '20000000-0000-0000-0000-000000000001'), 'user upload is attributed to uploader and cannot pose as auto');
insert into public.newspaper_advertisements (publication_id, configuration, phones) values ('20000000-0000-0000-0000-000000000001', '1 BHK', array['+919800000002']);
select pg_temp.expect((select created_by = auth.uid() from public.newspaper_advertisements where publication_id = '20000000-0000-0000-0000-000000000001'), 'user can add adverts from an uploaded paper');
insert into storage.objects (bucket_id, name) values ('newspaper-pdfs', 'uploads/00000000-0000-0000-0000-00000000000c/paper.pdf');
select pg_temp.expect(true, 'user can upload paper PDF into own uploads folder');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
delete from public.newspaper_advertisements where publication_id = '20000000-0000-0000-0000-000000000001';
delete from public.newspaper_publications where id = '20000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect((select count(*) from public.newspaper_advertisements where publication_id = '20000000-0000-0000-0000-000000000001') = 1, 'other users cannot delete someone else''s uploaded paper or adverts');
select pg_temp.expect((select ad_count = 1 from public.newspaper_publications where id = '20000000-0000-0000-0000-000000000001'), 'edition advert count kept in sync');
select pg_temp.act_as(null);
do $$ begin
  insert into public.newspaper_publications (name, edition_date) values ('anon', '2026-11-21');
  raise exception 'FAIL: anon uploaded';
exception when insufficient_privilege then raise notice 'PASS: signed-out visitors cannot upload papers'; end $$;
reset role;

rollback;
