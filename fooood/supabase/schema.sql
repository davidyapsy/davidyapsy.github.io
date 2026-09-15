-- fooood — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Project > SQL Editor > New query > paste > Run).

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,              -- e.g. "FamilyMart Onigiri"
  store       text,                       -- e.g. "FamilyMart"
  category    text,                       -- e.g. "Onigiri"
  emoji       text not null default '🍽️',
  icon_url    text,                       -- set when a custom uploaded photo is used instead of an emoji
  created_at  timestamptz not null default now()
);

-- Already ran this file before icon_url existed? This line is safe to
-- run on its own — it's a no-op if the column is already there.
alter table public.lists add column if not exists icon_url text;

create table if not exists public.food_items (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.lists(id) on delete cascade,
  name        text not null,
  photo_url   text,
  price       numeric,
  notes       text,
  rank        double precision not null,  -- lower number = higher rank (#1 has the smallest rank)
  created_at  timestamptz not null default now()
);

create index if not exists food_items_list_id_idx on public.food_items (list_id);
create index if not exists food_items_rank_idx on public.food_items (list_id, rank);

-- ---------------------------------------------------------------------
-- Row Level Security
--
-- This app has no login screen for v1 — it's a private single-user app
-- for personal use, protected only by the fact that nobody else knows
-- the URL. These policies let the public "anon" key (the one that ends
-- up in the site's JS bundle) read and write freely. That's fine for a
-- link only you and your girlfriend have, but don't post the URL
-- publicly. If you ever want real login-gated access, swap these
-- policies for ones that check auth.uid() and add Supabase Auth.
-- ---------------------------------------------------------------------

alter table public.lists enable row level security;
alter table public.food_items enable row level security;

create policy "lists are publicly readable" on public.lists
  for select using (true);
create policy "lists are publicly writable" on public.lists
  for insert with check (true);
create policy "lists are publicly updatable" on public.lists
  for update using (true);
create policy "lists are publicly deletable" on public.lists
  for delete using (true);

create policy "food_items are publicly readable" on public.food_items
  for select using (true);
create policy "food_items are publicly writable" on public.food_items
  for insert with check (true);
create policy "food_items are publicly updatable" on public.food_items
  for update using (true);
create policy "food_items are publicly deletable" on public.food_items
  for delete using (true);

-- RLS policies only filter which ROWS a role can see or touch — Postgres
-- still requires the base table-level GRANT before it even evaluates
-- policies. Without this, every request fails with "permission denied
-- for table ..." (error 42501), regardless of the policies above.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.lists to anon, authenticated;
grant select, insert, update, delete on public.food_items to anon, authenticated;

-- ---------------------------------------------------------------------
-- Storage bucket for food photos
--
-- The Supabase SQL editor can create the bucket + its policies too, so
-- you don't have to click through the Storage UI.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', true)
on conflict (id) do nothing;

create policy "food photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'food-photos');

create policy "food photos are publicly uploadable"
  on storage.objects for insert
  with check (bucket_id = 'food-photos');

create policy "food photos are publicly deletable"
  on storage.objects for delete
  using (bucket_id = 'food-photos');
