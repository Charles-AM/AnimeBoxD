-- AnimeBoxD Phase 2 Supabase schema
-- Run this in Supabase SQL Editor after creating the project.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text not null default 'Anime fan',
  avatar text not null default '✨',
  bio text not null default '',
  is_public boolean not null default false,
  is_admin boolean not null default false,
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists email text;

alter table public.profiles
add column if not exists last_seen timestamptz;

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

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text not null default '',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_app_data enable row level security;
alter table public.user_reports enable row level security;
alter table public.anime_home_cache enable row level security;
alter table public.activity_events enable row level security;
alter table public.admin_notifications enable row level security;

alter table public.profiles
alter column is_public set default false;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

drop policy if exists "Profiles are viewable by owner or public" on public.profiles;
drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile"
on public.profiles for select
using (auth.uid() = id or public.current_user_is_admin());

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
on public.profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles"
on public.profiles for select
using (public.current_user_is_admin());

drop policy if exists "Users read own app data" on public.user_app_data;
create policy "Users read own app data"
on public.user_app_data for select
using (auth.uid() = user_id or public.current_user_is_admin());

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
using (auth.uid() = user_id or public.current_user_is_admin());

drop policy if exists "Users create own activity" on public.activity_events;
create policy "Users create own activity"
on public.activity_events for insert
with check (auth.uid() = user_id);

drop policy if exists "Users read own activity" on public.activity_events;
create policy "Users read own activity"
on public.activity_events for select
using (auth.uid() = user_id or public.current_user_is_admin());

drop policy if exists "Admins read notifications" on public.admin_notifications;
create policy "Admins read notifications"
on public.admin_notifications for select
using (public.current_user_is_admin());

drop policy if exists "Admins update notifications" on public.admin_notifications;
create policy "Admins update notifications"
on public.admin_notifications for update
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create or replace function public.log_new_profile_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_notifications (kind, title, body)
  values (
    'signup',
    'New user signup',
    coalesce(new.username, 'Anime fan') || coalesce(' joined with ' || new.email, ' joined AnimeBoxD')
  );
  return new;
end;
$$;

drop trigger if exists notify_admin_new_profile on public.profiles;
create trigger notify_admin_new_profile
after insert on public.profiles
for each row execute function public.log_new_profile_notification();

create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.current_user_is_admin() then
    new.is_admin = old.is_admin;
    new.email = old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_admin_fields on public.profiles;
create trigger protect_profile_admin_fields
before update on public.profiles
for each row execute function public.protect_profile_admin_fields();

create or replace function public.log_new_report_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_notifications (kind, title, body)
  values (
    'report',
    'New user report',
    coalesce(new.category, 'Report') || ' - ' || left(coalesce(new.message, ''), 160)
  );
  return new;
end;
$$;

drop trigger if exists notify_admin_new_report on public.user_reports;
create trigger notify_admin_new_report
after insert on public.user_reports
for each row execute function public.log_new_report_notification();

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

create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users
  where id = auth.uid();
end;
$$;

revoke all on function public.delete_current_user() from public;
grant execute on function public.delete_current_user() to authenticated;
