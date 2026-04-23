-- Run this in Supabase SQL Editor
-- This schema stores users and joined cities in relational tables
-- and also supports the existing app_state backup sync.

create table if not exists public.profiles (
  user_id text primary key,
  phone text not null unique,
  email text,
  balance numeric(14,2) not null default 0,
  total_earnings numeric(14,2) not null default 0,
  today_income numeric(14,2) not null default 0,
  tasks_completed_today integer not null default 0,
  referral_code text unique,
  referred_count integer not null default 0,
  referral_bonus_earned boolean not null default false,
  active boolean not null default true,
  created_at timestamptz,
  last_task_date text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_phone on public.profiles (phone);
create index if not exists idx_profiles_referral_code on public.profiles (referral_code);

create table if not exists public.user_cities (
  id bigint generated always as identity primary key,
  user_id text not null references public.profiles(user_id) on delete cascade,
  city_code text not null,
  joined_at timestamptz not null default now(),
  unique(user_id, city_code)
);

create index if not exists idx_user_cities_user on public.user_cities (user_id);

-- Optional: keeps full serialized snapshot used by server for fallback/compatibility.
create table if not exists public.app_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz
);

-- (Optional) If using RLS, keep service-role access or define policies.
alter table public.profiles enable row level security;
alter table public.user_cities enable row level security;
alter table public.app_state enable row level security;

-- Example policies for authenticated admin/dashboard service usage.
-- Adjust to your auth model before production.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_service_all'
  ) then
    create policy profiles_service_all on public.profiles for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_cities' and policyname='cities_service_all'
  ) then
    create policy cities_service_all on public.user_cities for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='app_state' and policyname='state_service_all'
  ) then
    create policy state_service_all on public.app_state for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
