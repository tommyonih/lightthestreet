-- Light Up Your Street game: add game-specific columns to the shared
-- public.profiles table and create the saves/reports tables + cards bucket.
-- Run in Supabase SQL Editor. Safe to re-run.

-- 1. Add game columns to the existing profiles table (NextPawa owns profiles).
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists updated_at timestamptz not null default now();

-- 2. Game saves: one row per user, the full GameState JSON.
create table if not exists public.saves (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  ver        int  not null,
  game_time  int  not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  check (pg_column_size(data) < 512 * 1024)
);

alter table public.saves enable row level security;

drop policy if exists "own save: read"   on public.saves;
drop policy if exists "own save: insert" on public.saves;
drop policy if exists "own save: update" on public.saves;
drop policy if exists "own save: delete" on public.saves;

create policy "own save: read"   on public.saves for select to authenticated using (auth.uid() = user_id);
create policy "own save: insert" on public.saves for insert to authenticated with check (auth.uid() = user_id);
create policy "own save: update" on public.saves for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own save: delete" on public.saves for delete to authenticated using (auth.uid() = user_id);

grant all on public.saves to service_role;

-- 3. Game reports: snapshots when a session or week ends.
create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('session', 'week')),
  day        int  not null,
  week       int,
  card_path  text,
  cash       int  not null,
  blackouts  int  not null,
  happiness  int  not null,
  trust      int  not null,
  stats      jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists reports_user_created on public.reports (user_id, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "own reports: read"   on public.reports;
drop policy if exists "own reports: insert" on public.reports;
drop policy if exists "own reports: delete" on public.reports;

create policy "own reports: read"   on public.reports for select to authenticated using (auth.uid() = user_id);
create policy "own reports: insert" on public.reports for insert to authenticated with check (auth.uid() = user_id);
create policy "own reports: delete" on public.reports for delete to authenticated using (auth.uid() = user_id);

grant all on public.reports to service_role;

-- 4. Allow the game to update its display name without revoking any
-- existing profile permissions used by the NextPawa application.
grant update (display_name) on public.profiles to authenticated;

-- 5. Private storage bucket for share cards.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', false, 2 * 1024 * 1024, array['image/png'])
on conflict (id) do nothing;

drop policy if exists "own cards: read" on storage.objects;
drop policy if exists "own cards: upload" on storage.objects;
drop policy if exists "own cards: delete" on storage.objects;

create policy "own cards: read" on storage.objects for select to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cards: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cards: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = (select auth.uid())::text);