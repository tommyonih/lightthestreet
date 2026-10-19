-- Light Up the Street: accounts, cloud saves and street reports.
-- Every table is owner-only through Row Level Security: a player can read and write their own rows and nothing else.

-- ---------- profiles: one per auth user, created automatically on sign-up ----------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Resident' check (char_length(display_name) between 1 and 40),
  email        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- saves: the player's one cloud save (the same GameState JSON kept in localStorage) ----------
create table public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  ver        int  not null,                       -- GameState.ver, so old saves can be migrated client-side
  game_time  int  not null,                       -- day*1440 + minute; the furthest-along save wins a sync
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  check (pg_column_size(data) < 512 * 1024)       -- a save is a few KB; this stops abuse, not players
);

-- ---------- reports: a snapshot each time a session or week ends, with its share card ----------
create table public.reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('session', 'week')),
  day        int  not null,
  week       int,
  card_path  text,                                -- object path in the private `cards` bucket ({user_id}/{file}.png)
  cash       int  not null,
  blackouts  int  not null,
  happiness  int  not null,
  trust      int  not null,
  stats      jsonb not null,                      -- full GameState.stats at the time
  created_at timestamptz not null default now()
);
create index reports_user_created on public.reports (user_id, created_at desc);

-- ---------- updated_at ----------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger saves_touch    before update on public.saves    for each row execute function public.touch_updated_at();

-- ---------- profile on sign-up (email/password or Google) ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
                  nullif(new.raw_user_meta_data ->> 'full_name', ''),   -- Google
                  'Resident'), 40)
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.saves    enable row level security;
alter table public.reports  enable row level security;

-- profiles: rows are created by the trigger, so players can only read and update their own
create policy "own profile: read"   on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "own profile: update" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own save: read"   on public.saves for select to authenticated using ((select auth.uid()) = user_id);
create policy "own save: insert" on public.saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own save: update" on public.saves for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own save: delete" on public.saves for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own reports: read"   on public.reports for select to authenticated using ((select auth.uid()) = user_id);
create policy "own reports: insert" on public.reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own reports: delete" on public.reports for delete to authenticated using ((select auth.uid()) = user_id);

-- only the display name is editable from the client (a column-level revoke can't undo Supabase's table-level grant)
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------- storage: private bucket for share cards, one folder per user ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', false, 2 * 1024 * 1024, array['image/png']);

create policy "own cards: read" on storage.objects for select to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cards: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cards: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
