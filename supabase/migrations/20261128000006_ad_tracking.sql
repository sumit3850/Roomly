-- ════════════════════════════════════════════════════════════════════
-- 0006: Personal tracking for newspaper adverts (status + notes + hide),
-- like the original TO LET tracker. Each user tracks adverts privately.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.newspaper_ad_tracking (
  user_id          uuid not null references auth.users (id) on delete cascade,
  advertisement_id uuid not null references public.newspaper_advertisements (id) on delete cascade,
  status           text not null default 'Vacant' check (status in ('Vacant', 'Contacted', 'Visited', 'Filled')),
  notes            text not null default '' check (char_length(notes) <= 1000),
  hidden           boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, advertisement_id)
);
create index if not exists ad_tracking_ad_idx on public.newspaper_ad_tracking (advertisement_id);
drop trigger if exists ad_tracking_updated_at on public.newspaper_ad_tracking;
create trigger ad_tracking_updated_at before update on public.newspaper_ad_tracking
  for each row execute function public.set_updated_at();

alter table public.newspaper_ad_tracking enable row level security;
drop policy if exists "ad tracking: own" on public.newspaper_ad_tracking;
create policy "ad tracking: own" on public.newspaper_ad_tracking for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.newspaper_ad_tracking to authenticated;

-- make the new table visible to the API immediately
notify pgrst, 'reload schema';
