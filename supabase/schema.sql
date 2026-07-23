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
-- 3. Auth settings (do this in the Dashboard, not SQL):
--    Authentication → Providers → Email: enable "Email" provider.
--    Authentication → URL Configuration: set Site URL and add your
--    dev/prod URLs (e.g. http://localhost:3000, your deployed domain)
--    to "Redirect URLs" so magic link emails send users back to the app.
-- ─────────────────────────────────────────────────────────────
