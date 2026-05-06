-- AnimeBoxD Phase 2 Supabase schema
-- Run this in Supabase SQL Editor after creating the project.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'Anime fan',
  avatar text not null default '✨',
  bio text not null default '',
  is_public boolean not null default true,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text,
  email text,
  category text not null default 'Suggestion',
  priority text not null default 'Normal',
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.user_reports
add column if not exists priority text not null default 'Normal';

create table if not exists public.anime_home_cache (
  cache_key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_app_data enable row level security;
alter table public.user_reports enable row level security;
alter table public.anime_home_cache enable row level security;

drop policy if exists "Profiles are viewable by owner or public" on public.profiles;
create policy "Profiles are viewable by owner or public"
on public.profiles for select
using (is_public = true or auth.uid() = id);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
on public.profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users read own app data" on public.user_app_data;
create policy "Users read own app data"
on public.user_app_data for select
using (auth.uid() = user_id);

drop policy if exists "Users write own app data" on public.user_app_data;
create policy "Users write own app data"
on public.user_app_data for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users create reports" on public.user_reports;
create policy "Users create reports"
on public.user_reports for insert
with check (auth.uid() = user_id or user_id is null);

drop policy if exists "Users read own reports" on public.user_reports;
create policy "Users read own reports"
on public.user_reports for select
using (auth.uid() = user_id);

drop policy if exists "Anyone can read anime home cache" on public.anime_home_cache;
create policy "Anyone can read anime home cache"
on public.anime_home_cache for select
using (true);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_user_app_data_updated_at on public.user_app_data;
create trigger touch_user_app_data_updated_at
before update on public.user_app_data
for each row execute function public.touch_updated_at();
