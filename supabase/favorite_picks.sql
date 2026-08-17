-- AnimeBoxD: "What's your favorite?" picks
-- Run this in Supabase SQL Editor after schema.sql

create table if not exists public.favorite_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text not null,
  media_type text not null default 'anime',
  mal_id integer,
  title text not null,
  image_url text,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.favorite_picks enable row level security;

-- One active pick per signed-in account, and one per anonymous session, so a
-- single visitor cannot stack multiple entries and skew the board.
create unique index if not exists favorite_picks_user_id_unique
  on public.favorite_picks (user_id) where user_id is not null;

create unique index if not exists favorite_picks_session_id_unique
  on public.favorite_picks (session_id) where user_id is null;

create index if not exists favorite_picks_created_at_idx
  on public.favorite_picks (created_at desc);

drop policy if exists "Anyone can add a favorite pick" on public.favorite_picks;
create policy "Anyone can add a favorite pick"
on public.favorite_picks for insert
with check (
  media_type in ('anime', 'manga', 'manhwa')
  and length(trim(title)) > 0
  and length(trim(reason)) > 0
  and length(reason) <= 280
);

drop policy if exists "Anyone can read favorite picks" on public.favorite_picks;
create policy "Anyone can read favorite picks"
on public.favorite_picks for select
using (true);

drop policy if exists "Users update their own favorite pick" on public.favorite_picks;
create policy "Users update their own favorite pick"
on public.favorite_picks for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and media_type in ('anime', 'manga', 'manhwa')
  and length(trim(title)) > 0
  and length(trim(reason)) > 0
  and length(reason) <= 280
);
