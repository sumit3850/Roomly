-- ════════════════════════════════════════════════════════════════════
-- Roomly — Andaman & Nicobar Property Rental Marketplace
-- 0001: core schema (tables, enums, indexes, constraints, triggers)
-- ════════════════════════════════════════════════════════════════════
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ─── Enums ──────────────────────────────────────────────────────────
do $$ begin
  create type public.app_role as enum ('tenant', 'owner', 'commercial_owner', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_type as enum ('tenant', 'owner', 'commercial_owner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.property_status as enum ('draft', 'active', 'rented', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.enquiry_status as enum ('new', 'responded', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- ─── Shared trigger: updated_at ─────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─── profiles ───────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text not null default '' check (char_length(full_name) <= 120),
  email               text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone               text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  avatar_url          text,
  account_type        public.account_type not null default 'tenant',
  preferred_location  text check (char_length(preferred_location) <= 120),
  bio                 text check (char_length(bio) <= 1000),
  verification_status text not null default 'unverified'
                      check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  notification_prefs  jsonb not null default
                      '{"enquiries": true, "enquiry_responses": true, "recommendations": true, "marketing": false}'::jsonb,
  is_suspended        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists profiles_phone_unique on public.profiles (phone) where phone is not null;
create index if not exists profiles_email_idx on public.profiles (lower(email));
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─── user_roles ─────────────────────────────────────────────────────
create table if not exists public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index if not exists user_roles_user_idx on public.user_roles (user_id);

-- Role helpers (SECURITY DEFINER so they can be used inside RLS without recursion)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin');
$$;

-- ─── New-user bootstrap: profile + roles ───────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _acct public.account_type;
  _name text;
  _phone text;
begin
  begin
    _acct := coalesce(nullif(new.raw_user_meta_data ->> 'account_type', ''), 'tenant')::public.account_type;
  exception when others then
    _acct := 'tenant';
  end;
  _name  := left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120);
  _phone := coalesce(nullif(new.phone, ''), nullif(new.raw_user_meta_data ->> 'phone', ''));
  if _phone is not null and left(_phone, 1) <> '+' then _phone := '+' || _phone; end if;
  if _phone is not null and _phone !~ '^\+[1-9][0-9]{7,14}$' then _phone := null; end if;
  -- never steal a phone number already claimed by another profile
  if _phone is not null and exists (select 1 from public.profiles where phone = _phone) then _phone := null; end if;

  insert into public.profiles (id, full_name, email, phone, account_type)
  values (new.id, _name, nullif(new.email, ''), _phone, _acct)
  on conflict (id) do nothing;

  -- Everyone can browse/enquire as a tenant; plus their chosen account type.
  insert into public.user_roles (user_id, role) values (new.id, 'tenant') on conflict do nothing;
  if _acct <> 'tenant' then
    insert into public.user_roles (user_id, role) values (new.id, _acct::text::public.app_role) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email/phone in sync when the auth record changes (e.g. verified email change)
create or replace function public.sync_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set email = coalesce(nullif(new.email, ''), email),
         phone = case
                   when nullif(new.phone, '') is null then phone
                   when not exists (select 1 from public.profiles p where p.phone = '+' || ltrim(new.phone, '+') and p.id <> new.id)
                     then '+' || ltrim(new.phone, '+')
                   else phone
                 end
   where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email, phone on auth.users
  for each row execute function public.sync_auth_user();

-- Ordinary users can't change their own verification / suspension flags
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    new.verification_status := case
      -- users may *request* verification (unverified/rejected → pending), nothing else
      when new.verification_status = 'pending' and old.verification_status in ('unverified', 'rejected') then 'pending'
      else old.verification_status end;
    new.is_suspended := old.is_suspended;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Self-service role management (never admin)
create or replace function public.set_self_role(_role public.app_role, _enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if _role = 'admin' then raise exception 'Admin role can only be granted by an administrator'; end if;
  if _role = 'tenant' and not _enabled then raise exception 'Tenant access cannot be removed'; end if;
  if _enabled then
    insert into public.user_roles (user_id, role) values (auth.uid(), _role) on conflict do nothing;
  else
    delete from public.user_roles where user_id = auth.uid() and role = _role;
  end if;
end $$;

-- ─── property_categories ───────────────────────────────────────────
create table if not exists public.property_categories (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name          text not null,
  is_commercial boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- ─── properties ────────────────────────────────────────────────────
create table if not exists public.properties (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  category_id       uuid references public.property_categories (id) on delete set null,
  title             text not null check (char_length(title) between 5 and 140),
  description       text check (char_length(description) <= 5000),
  configuration     text not null default 'Other'
                    check (configuration in ('1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '5+ BHK', 'Single Room', 'Studio', 'Other')),
  is_commercial     boolean not null default false,
  furnishing        text not null default 'unfurnished' check (furnishing in ('unfurnished', 'semi-furnished', 'fully-furnished')),
  rent_amount       numeric(12, 2) not null check (rent_amount >= 0 and rent_amount <= 100000000),
  security_deposit  numeric(12, 2) not null default 0 check (security_deposit >= 0),
  maintenance_fee   numeric(12, 2) not null default 0 check (maintenance_fee >= 0),
  area_sqft         int check (area_sqft is null or area_sqft between 1 and 1000000),
  bathrooms         smallint check (bathrooms is null or bathrooms between 0 and 50),
  floor_label       text check (char_length(floor_label) <= 40),
  available_from    date,
  preferred_tenants text not null default 'any' check (preferred_tenants in ('any', 'family', 'bachelors', 'working-professionals', 'students', 'company')),
  contact_name      text check (char_length(contact_name) <= 120),
  contact_phone     text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  status            public.property_status not null default 'active',
  is_verified       boolean not null default false,
  is_featured       boolean not null default false,
  views_count       int not null default 0,
  rented_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists properties_owner_idx    on public.properties (owner_id);
create index if not exists properties_status_idx   on public.properties (status, created_at desc);
create index if not exists properties_config_idx   on public.properties (configuration);
create index if not exists properties_rent_idx     on public.properties (rent_amount);
create index if not exists properties_category_idx on public.properties (category_id);
create index if not exists properties_title_trgm   on public.properties using gin (title gin_trgm_ops);
-- Duplicate listing protection: same owner cannot have two live listings with the same title
create unique index if not exists properties_owner_title_unique
  on public.properties (owner_id, lower(btrim(title))) where status in ('draft', 'active');

drop trigger if exists properties_updated_at on public.properties;
create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

-- Only admins may verify/feature; only server code may change view counts; owner_id immutable
create or replace function public.protect_property_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- SQL editor / migrations (no JWT), service role and admins bypass the guard
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_verified := false;
    new.is_featured := false;
    new.views_count := 0;
    new.owner_id    := auth.uid();
  else
    new.is_verified := old.is_verified;
    new.is_featured := old.is_featured;
    new.views_count := old.views_count;
    new.owner_id    := old.owner_id;
    -- an edited listing loses its verification badge unless only status changed
    if (new.title, new.description, new.rent_amount, new.configuration) is distinct from
       (old.title, old.description, old.rent_amount, old.configuration) then
      new.is_verified := false;
    end if;
  end if;
  if new.status = 'rented' and (tg_op = 'INSERT' or old.status <> 'rented') then
    new.rented_at := now();
  end if;
  return new;
end $$;
drop trigger if exists properties_protect on public.properties;
create trigger properties_protect before insert or update on public.properties
  for each row execute function public.protect_property_fields();

-- Guard: suspended users cannot publish
create or replace function public.block_suspended_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = new.owner_id and is_suspended) then
    raise exception 'Your account is suspended. Contact support.';
  end if;
  return new;
end $$;
drop trigger if exists properties_block_suspended on public.properties;
create trigger properties_block_suspended before insert on public.properties
  for each row execute function public.block_suspended_owner();

-- ─── property_images ───────────────────────────────────────────────
create table if not exists public.property_images (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  storage_path text not null unique,
  sort_order   int not null default 0,
  is_cover     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists property_images_property_idx on public.property_images (property_id, sort_order);

-- ─── property_locations (1:1 with properties) ──────────────────────
create table if not exists public.property_locations (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null unique references public.properties (id) on delete cascade,
  island       text not null default 'South Andaman' check (char_length(island) <= 80),
  area         text not null check (char_length(area) between 2 and 120),
  address_line text check (char_length(address_line) <= 250),
  landmark     text check (char_length(landmark) <= 160),
  pincode      text check (pincode is null or pincode ~ '^7441[0-9]{2}$'),
  latitude     double precision check (latitude is null or latitude between 6 and 14.5),
  longitude    double precision check (longitude is null or longitude between 92 and 94.5),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create index if not exists property_locations_area_trgm on public.property_locations using gin (area gin_trgm_ops);
create index if not exists property_locations_geo_idx   on public.property_locations (latitude, longitude);
drop trigger if exists property_locations_updated_at on public.property_locations;
create trigger property_locations_updated_at before update on public.property_locations
  for each row execute function public.set_updated_at();

-- ─── amenities ─────────────────────────────────────────────────────
create table if not exists public.amenities (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name       text not null,
  icon       text,
  created_at timestamptz not null default now()
);

create table if not exists public.property_amenities (
  property_id uuid not null references public.properties (id) on delete cascade,
  amenity_id  uuid not null references public.amenities (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (property_id, amenity_id)
);
create index if not exists property_amenities_amenity_idx on public.property_amenities (amenity_id);

-- ─── property_enquiries ────────────────────────────────────────────
create table if not exists public.property_enquiries (
  id                   uuid primary key default gen_random_uuid(),
  property_id          uuid not null references public.properties (id) on delete cascade,
  tenant_id            uuid not null references auth.users (id) on delete cascade,
  owner_id             uuid not null references auth.users (id) on delete cascade,
  message              text not null check (char_length(message) between 5 and 2000),
  contact_phone        text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  preferred_visit_date date,
  status               public.enquiry_status not null default 'new',
  owner_response       text check (char_length(owner_response) <= 2000),
  responded_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists enquiries_owner_idx    on public.property_enquiries (owner_id, created_at desc);
create index if not exists enquiries_tenant_idx   on public.property_enquiries (tenant_id, created_at desc);
create index if not exists enquiries_property_idx on public.property_enquiries (property_id);
-- one open enquiry per tenant per property
create unique index if not exists enquiries_one_open
  on public.property_enquiries (property_id, tenant_id) where status <> 'closed';
drop trigger if exists enquiries_updated_at on public.property_enquiries;
create trigger enquiries_updated_at before update on public.property_enquiries
  for each row execute function public.set_updated_at();

-- owner_id is always derived from the property; tenants can't message their own listing;
-- tenants can only edit message/close, owners can only respond/close.
create or replace function public.guard_enquiry()
returns trigger language plpgsql security definer set search_path = public as $$
declare _owner uuid; _status public.property_status;
begin
  if tg_op = 'INSERT' then
    select owner_id, status into _owner, _status from public.properties where id = new.property_id;
    if _owner is null then raise exception 'Property not found'; end if;
    if _status <> 'active' then raise exception 'This property is not accepting enquiries'; end if;
    if _owner = new.tenant_id then raise exception 'You cannot enquire about your own property'; end if;
    new.owner_id := _owner;
    new.status := 'new';
    new.owner_response := null;
    new.responded_at := null;
    return new;
  end if;

  if public.is_admin() then return new; end if;
  new.property_id := old.property_id;
  new.tenant_id   := old.tenant_id;
  new.owner_id    := old.owner_id;
  if auth.uid() = old.owner_id then
    new.message := old.message;
    new.contact_phone := old.contact_phone;
    new.preferred_visit_date := old.preferred_visit_date;
    if new.owner_response is distinct from old.owner_response and new.owner_response is not null then
      new.responded_at := now();
      if new.status = 'new' then new.status := 'responded'; end if;
    end if;
  elsif auth.uid() = old.tenant_id then
    new.owner_response := old.owner_response;
    new.responded_at := old.responded_at;
    if new.status not in (old.status, 'closed') then new.status := old.status; end if;
  end if;
  return new;
end $$;
drop trigger if exists enquiries_guard on public.property_enquiries;
create trigger enquiries_guard before insert or update on public.property_enquiries
  for each row execute function public.guard_enquiry();

-- ─── saved_properties ──────────────────────────────────────────────
create table if not exists public.saved_properties (
  user_id     uuid not null references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, property_id)
);
create index if not exists saved_properties_property_idx on public.saved_properties (property_id);

-- ─── rental_transactions ───────────────────────────────────────────
create table if not exists public.rental_transactions (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties (id) on delete cascade,
  owner_id         uuid not null references auth.users (id) on delete cascade,
  tenant_id        uuid references auth.users (id) on delete set null,
  enquiry_id       uuid references public.property_enquiries (id) on delete set null,
  tenant_name      text check (char_length(tenant_name) <= 120),
  monthly_rent     numeric(12, 2) not null check (monthly_rent >= 0),
  security_deposit numeric(12, 2) not null default 0 check (security_deposit >= 0),
  start_date       date not null default current_date,
  end_date         date,
  status           text not null default 'active' check (status in ('active', 'ended', 'cancelled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists rental_tx_property_idx on public.rental_transactions (property_id);
create index if not exists rental_tx_owner_idx    on public.rental_transactions (owner_id);
create index if not exists rental_tx_tenant_idx   on public.rental_transactions (tenant_id);
drop trigger if exists rental_tx_updated_at on public.rental_transactions;
create trigger rental_tx_updated_at before update on public.rental_transactions
  for each row execute function public.set_updated_at();

create or replace function public.guard_rental_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare _owner uuid;
begin
  select owner_id into _owner from public.properties where id = new.property_id;
  if _owner is null then raise exception 'Property not found'; end if;
  new.owner_id := _owner;
  if new.tenant_id = _owner then raise exception 'Owner cannot be the tenant'; end if;
  return new;
end $$;
drop trigger if exists rental_tx_guard on public.rental_transactions;
create trigger rental_tx_guard before insert or update on public.rental_transactions
  for each row execute function public.guard_rental_transaction();

-- ─── property_reviews ──────────────────────────────────────────────
create table if not exists public.property_reviews (
  id                 uuid primary key default gen_random_uuid(),
  property_id        uuid not null references public.properties (id) on delete cascade,
  reviewer_id        uuid not null references auth.users (id) on delete cascade,
  rating             smallint not null check (rating between 1 and 5),
  comment            text check (char_length(comment) <= 2000),
  is_verified_tenant boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (property_id, reviewer_id)
);
create index if not exists reviews_property_idx on public.property_reviews (property_id, created_at desc);
drop trigger if exists reviews_updated_at on public.property_reviews;
create trigger reviews_updated_at before update on public.property_reviews
  for each row execute function public.set_updated_at();

-- A review is "verified" when a rental transaction links reviewer + property.
create or replace function public.guard_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.properties where id = new.property_id and owner_id = new.reviewer_id) then
    raise exception 'Owners cannot review their own property';
  end if;
  new.is_verified_tenant := exists (
    select 1 from public.rental_transactions
     where property_id = new.property_id and tenant_id = new.reviewer_id and status in ('active', 'ended'));
  return new;
end $$;
drop trigger if exists reviews_guard on public.property_reviews;
create trigger reviews_guard before insert or update on public.property_reviews
  for each row execute function public.guard_review();

-- ─── newspaper_publications / advertisements ───────────────────────
create table if not exists public.newspaper_publications (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) <= 160),
  newspaper     text not null default 'Daily Telegrams',
  edition_date  date not null,
  pdf_path      text,
  page_count    int,
  status        text not null default 'uploaded' check (status in ('uploaded', 'processing', 'processed', 'failed')),
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (newspaper, edition_date)
);
drop trigger if exists publications_updated_at on public.newspaper_publications;
create trigger publications_updated_at before update on public.newspaper_publications
  for each row execute function public.set_updated_at();

create table if not exists public.newspaper_advertisements (
  id                 uuid primary key default gen_random_uuid(),
  publication_id     uuid not null references public.newspaper_publications (id) on delete cascade,
  ad_type            text not null default 'tolet' check (ad_type in ('tolet', 'sale', 'wanted', 'commercial', 'other')),
  configuration      text,
  location_text      text check (char_length(location_text) <= 300),
  phones             text[] not null default '{}',
  rent_text          text check (char_length(rent_text) <= 60),
  raw_text           text check (char_length(raw_text) <= 3000),
  is_commercial      boolean not null default false,
  is_furnished       boolean not null default false,
  page_number        int,
  extracted_page_path text,
  linked_property_id uuid references public.properties (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists ads_publication_idx on public.newspaper_advertisements (publication_id);
create index if not exists ads_phones_idx      on public.newspaper_advertisements using gin (phones);
create index if not exists ads_location_trgm   on public.newspaper_advertisements using gin (location_text gin_trgm_ops);
-- duplicate protection: same phone set in the same edition is one advert
create unique index if not exists ads_unique_per_edition
  on public.newspaper_advertisements (publication_id, phones, coalesce(configuration, ''));

-- ─── notifications ─────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null default 'system',
  title      text not null check (char_length(title) <= 200),
  body       text check (char_length(body) <= 1000),
  link       text check (char_length(link) <= 300),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- ─── user_reports (also used for Contact & Help messages) ──────────
create table if not exists public.user_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references auth.users (id) on delete set null,
  reporter_email   text check (reporter_email is null or reporter_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  reporter_name    text check (char_length(reporter_name) <= 120),
  property_id      uuid references public.properties (id) on delete cascade,
  reported_user_id uuid references auth.users (id) on delete cascade,
  reason           text not null check (reason in ('fraud', 'incorrect-info', 'already-rented', 'offensive', 'spam', 'duplicate', 'other', 'support')),
  details          text check (char_length(details) <= 3000),
  status           public.report_status not null default 'open',
  admin_notes      text check (char_length(admin_notes) <= 3000),
  resolved_by      uuid references auth.users (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (reason = 'support' or reporter_id is not null)
);
create index if not exists reports_status_idx on public.user_reports (status, created_at desc);

-- ════════════════════════════════════════════════════════════════════
-- Notification triggers
-- ════════════════════════════════════════════════════════════════════
create or replace function public.pref_enabled(_user uuid, _key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (notification_prefs ->> _key)::boolean from public.profiles where id = _user), true);
$$;

create or replace function public.notify_enquiry()
returns trigger language plpgsql security definer set search_path = public as $$
declare _title text;
begin
  select title into _title from public.properties where id = new.property_id;
  if tg_op = 'INSERT' then
    if public.pref_enabled(new.owner_id, 'enquiries') then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.owner_id, 'enquiry', 'New enquiry for ' || coalesce(_title, 'your property'),
              left(new.message, 200), '/dashboard/owner?tab=enquiries');
    end if;
  elsif new.owner_response is distinct from old.owner_response and new.owner_response is not null then
    if public.pref_enabled(new.tenant_id, 'enquiry_responses') then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.tenant_id, 'enquiry_response', 'Owner replied about ' || coalesce(_title, 'a property'),
              left(new.owner_response, 200), '/enquiries');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists enquiries_notify on public.property_enquiries;
create trigger enquiries_notify after insert or update on public.property_enquiries
  for each row execute function public.notify_enquiry();

create or replace function public.notify_property_rented()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'rented' and old.status <> 'rented' then
    -- tell people who saved it, and close open enquiries
    insert into public.notifications (user_id, type, title, body, link)
    select s.user_id, 'property_rented', 'A saved property has been rented', new.title, '/property/' || new.id
      from public.saved_properties s where s.property_id = new.id;
    update public.property_enquiries set status = 'closed' where property_id = new.id and status <> 'closed';
  end if;
  if new.is_verified and not old.is_verified then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.owner_id, 'verified', 'Your listing is now verified', new.title, '/property/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists properties_notify on public.properties;
create trigger properties_notify after update on public.properties
  for each row execute function public.notify_property_rented();

-- ════════════════════════════════════════════════════════════════════
-- RPCs
-- ════════════════════════════════════════════════════════════════════
-- Record a view (skips the owner); callable by anyone
create or replace function public.increment_property_view(_property_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.properties
     set views_count = views_count + 1
   where id = _property_id
     and status in ('active', 'rented')
     and owner_id is distinct from auth.uid();
end $$;

-- Mark rented + create the transaction atomically
create or replace function public.mark_property_rented(
  _property_id uuid, _tenant_name text default null, _tenant_id uuid default null,
  _enquiry_id uuid default null, _start_date date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare _p public.properties; _tx uuid;
begin
  select * into _p from public.properties where id = _property_id;
  if _p.id is null then raise exception 'Property not found'; end if;
  if _p.owner_id <> auth.uid() and not public.is_admin() then raise exception 'Not allowed'; end if;
  if _tenant_id is null and _enquiry_id is not null then
    select tenant_id into _tenant_id from public.property_enquiries where id = _enquiry_id and property_id = _property_id;
  end if;
  update public.properties set status = 'rented' where id = _property_id;
  insert into public.rental_transactions (property_id, owner_id, tenant_id, enquiry_id, tenant_name, monthly_rent, security_deposit, start_date)
  values (_property_id, _p.owner_id, _tenant_id, _enquiry_id, _tenant_name, _p.rent_amount, _p.security_deposit, coalesce(_start_date, current_date))
  returning id into _tx;
  if _tenant_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (_tenant_id, 'rental', 'Rental confirmed', 'You can now leave a verified review for ' || _p.title, '/property/' || _p.id);
  end if;
  return _tx;
end $$;

-- Relist a rented property (ends the active transaction)
create or replace function public.relist_property(_property_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.properties where id = _property_id and (owner_id = auth.uid() or public.is_admin())) then
    raise exception 'Not allowed';
  end if;
  update public.rental_transactions set status = 'ended', end_date = greatest(start_date, current_date)
   where property_id = _property_id and status = 'active';
  update public.properties set status = 'active', rented_at = null where id = _property_id;
end $$;

-- Admin: grant / revoke roles (privileged, server-side checked)
create or replace function public.admin_set_role(_user_id uuid, _role public.app_role, _enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator privileges required'; end if;
  if _role = 'admin' and not _enabled and _user_id = auth.uid() then
    raise exception 'You cannot remove your own admin role';
  end if;
  if _enabled then
    insert into public.user_roles (user_id, role, granted_by) values (_user_id, _role, auth.uid()) on conflict do nothing;
  else
    delete from public.user_roles where user_id = _user_id and role = _role;
  end if;
end $$;

-- Admin stats
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator privileges required'; end if;
  return json_build_object(
    'users',            (select count(*) from public.profiles),
    'properties',       (select count(*) from public.properties),
    'active',           (select count(*) from public.properties where status = 'active'),
    'rented',           (select count(*) from public.properties where status = 'rented'),
    'unverified',       (select count(*) from public.properties where status = 'active' and not is_verified),
    'enquiries',        (select count(*) from public.property_enquiries),
    'open_reports',     (select count(*) from public.user_reports where status in ('open', 'reviewing')),
    'publications',     (select count(*) from public.newspaper_publications),
    'advertisements',   (select count(*) from public.newspaper_advertisements),
    'pending_verifications', (select count(*) from public.profiles where verification_status = 'pending')
  );
end $$;

-- Check whether an email/phone already has an account (sign-up UX; returns only a boolean)
create or replace function public.identity_exists(_email text default null, _phone text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where (_email is not null and lower(email) = lower(_email))
        or (_phone is not null and phone = _phone));
$$;

-- ════════════════════════════════════════════════════════════════════
-- Views (security_invoker → RLS of the underlying tables applies)
-- ════════════════════════════════════════════════════════════════════
create or replace view public.property_listings with (security_invoker = true) as
select
  p.id, p.owner_id, p.title, p.description, p.configuration, p.is_commercial, p.furnishing,
  p.rent_amount, p.security_deposit, p.maintenance_fee, p.area_sqft, p.bathrooms, p.floor_label,
  p.available_from, p.preferred_tenants, p.contact_name, p.contact_phone, p.status,
  p.is_verified, p.is_featured, p.views_count, p.rented_at, p.created_at, p.updated_at,
  p.category_id, c.name as category_name, c.slug as category_slug,
  l.island, l.area, l.address_line, l.landmark, l.pincode, l.latitude, l.longitude,
  (select i.storage_path from public.property_images i
    where i.property_id = p.id order by i.is_cover desc, i.sort_order, i.created_at limit 1) as cover_path,
  (select count(*) from public.property_images i where i.property_id = p.id)::int as image_count,
  (select round(avg(r.rating)::numeric, 1) from public.property_reviews r where r.property_id = p.id) as avg_rating,
  (select count(*) from public.property_reviews r where r.property_id = p.id)::int as review_count
from public.properties p
left join public.property_categories c on c.id = p.category_id
left join public.property_locations  l on l.property_id = p.id;

-- Public-safe profile fields only (no email/phone). Runs as view owner by design.
create or replace view public.public_profiles as
select id, full_name, avatar_url, verification_status = 'verified' as is_verified, created_at
from public.profiles
where not is_suspended;
