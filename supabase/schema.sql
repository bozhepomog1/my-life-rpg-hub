-- Life RPG Hub — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.

-- ─────────────────────────────────────────────────────────────
-- 1. game_states: one JSONB blob per user holding the whole
--    GameState object (mirrors src/lib/game.ts).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.game_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.game_states enable row level security;

drop policy if exists "select own game_state" on public.game_states;
create policy "select own game_state"
  on public.game_states for select
  using (auth.uid() = user_id);

drop policy if exists "insert own game_state" on public.game_states;
create policy "insert own game_state"
  on public.game_states for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own game_state" on public.game_states;
create policy "update own game_state"
  on public.game_states for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- keep updated_at fresh on every write
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_game_states_updated_at on public.game_states;
create trigger trg_game_states_updated_at
  before update on public.game_states
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. Storage bucket for quest photo proof.
--    Files are stored under a path of "<user_id>/<quest_id>-<filename>"
--    so RLS can scope access per-user by the first path segment.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('quest-photos', 'quest-photos', false)
on conflict (id) do nothing;

drop policy if exists "read own quest photos" on storage.objects;
create policy "read own quest photos"
  on storage.objects for select
  using (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "upload own quest photos" on storage.objects;
create policy "upload own quest photos"
  on storage.objects for insert
  with check (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "update own quest photos" on storage.objects;
create policy "update own quest photos"
  on storage.objects for update
  using (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "delete own quest photos" on storage.objects;
create policy "delete own quest photos"
  on storage.objects for delete
  using (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─────────────────────────────────────────────────────────────
-- 3. profiles: a PUBLIC-SAFE subset of each user's progress, so
--    friends can see each other on the leaderboard without exposing
--    the full game_state (quests, photos, nutrition, etc.). Kept in
--    sync client-side on every save (see src/lib/profiles.ts).
--    email is stored here only to allow "add friend by email" search;
--    no private progress data lives in this table.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  avatar text,
  total_xp integer not null default 0,
  level integer not null default 1,
  fitness_index integer,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any authenticated user can read these public fields (needed for the
-- add-by-email search and to render friends on the leaderboard).
drop policy if exists "read profiles (authenticated)" on public.profiles;
create policy "read profiles (authenticated)"
  on public.profiles for select
  to authenticated
  using (true);

-- A user may create/update only their own profile row.
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. friend_requests: pending/accepted/declined between two users.
--    An accepted row (in either direction) means the two are friends.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (from_user, to_user)
);

alter table public.friend_requests enable row level security;

-- You can see requests you sent or received.
drop policy if exists "read own friend_requests" on public.friend_requests;
create policy "read own friend_requests"
  on public.friend_requests for select
  to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

-- You can send a request only as yourself.
drop policy if exists "send friend_request" on public.friend_requests;
create policy "send friend_request"
  on public.friend_requests for insert
  to authenticated
  with check (auth.uid() = from_user);

-- Either party can update the row (recipient accepts/declines; either can
-- change status). Restricted to rows you're part of.
drop policy if exists "update own friend_requests" on public.friend_requests;
create policy "update own friend_requests"
  on public.friend_requests for update
  to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user)
  with check (auth.uid() = from_user or auth.uid() = to_user);

-- Either party can delete (cancel / remove).
drop policy if exists "delete own friend_requests" on public.friend_requests;
create policy "delete own friend_requests"
  on public.friend_requests for delete
  to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

-- ─────────────────────────────────────────────────────────────
-- 5. Auth settings (do this in the Dashboard, not SQL):
--    Authentication → Providers → Email: enable "Email" provider.
--    Authentication → URL Configuration: set Site URL and add your
--    dev/prod URLs (e.g. http://localhost:3000, your deployed domain)
--    to "Redirect URLs" so magic link emails send users back to the app.
-- ─────────────────────────────────────────────────────────────
