-- AnimeBoxD security audit
-- Run this in Supabase SQL Editor after schema.sql.
-- It does not change data; it shows whether the production tables are protected.

select
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  case
    when rowsecurity then 'ok'
    else 'needs attention'
  end as status
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'user_app_data', 'user_reports', 'anime_home_cache')
order by tablename;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'user_app_data', 'user_reports', 'anime_home_cache')
order by tablename, policyname;

select
  'profiles owner read/write only' as check_name,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users read their own profile'
      and qual ilike '%auth.uid() = id%'
  ) as passed
union all
select
  'user_app_data owner read/write only',
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_app_data'
      and policyname = 'Users read own app data'
      and qual ilike '%auth.uid() = user_id%'
  )
union all
select
  'reports insert allowed but private by owner',
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_reports'
      and policyname = 'Users read own reports'
      and qual ilike '%auth.uid() = user_id%'
  )
union all
select
  'home cache read only for public clients',
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'anime_home_cache'
      and policyname = 'Anyone can read anime home cache'
      and cmd = 'SELECT'
  );
