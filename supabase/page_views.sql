-- AnimeBoxD: page_views table for visitor reach tracking
-- Run this in Supabase SQL Editor after schema.sql

create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  page text not null default 'home',
  referrer text,
  created_at timestamptz not null default now()
);

alter table public.page_views enable row level security;

-- Anyone (including anonymous visitors) can log a page view
drop policy if exists "Anyone can log page views" on public.page_views;
create policy "Anyone can log page views"
on public.page_views for insert
with check (true);

-- Only admins can read page view data
drop policy if exists "Admins read page views" on public.page_views;
create policy "Admins read page views"
on public.page_views for select
using (public.current_user_is_admin());

-- Index for fast admin queries
create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_session_id_idx on public.page_views (session_id);
