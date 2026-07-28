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

-- Defence in depth: anon (signed-out) must never touch this table at all.
-- The policies below would already block it (auth.uid() is NULL, so
-- "auth.uid() = user_id" is NULL → not true → denied), but revoking the
-- grant means a missing/dropped policy can't silently open it up either.
revoke all on public.game_states from anon;
grant select, insert, update on public.game_states to authenticated;

-- One row per user, readable/writable ONLY by that user. Every policy is
-- scoped `to authenticated` and matched on auth.uid() = user_id, so there
-- is no path by which one account can read or modify another's row.
drop policy if exists "select own game_state" on public.game_states;
create policy "select own game_state"
  on public.game_states for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "insert own game_state" on public.game_states;
create policy "insert own game_state"
  on public.game_states for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "update own game_state" on public.game_states;
create policy "update own game_state"
  on public.game_states for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own game_state" on public.game_states;
create policy "delete own game_state"
  on public.game_states for delete
  to authenticated
  using (auth.uid() = user_id);

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
--    the full game_state (quests, photos, nutrition, etc.).
--
--    SECURITY: this table contains NO email and no private data.
--    RLS is row-level, not column-level — an email column here would
--    be readable for EVERY row by any authenticated user, letting
--    anyone dump the whole user list. Email lives in the separate
--    private table below instead (see section 4).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  avatar text,
  total_xp integer not null default 0,
  level integer not null default 1,
  fitness_index integer,
  updated_at timestamptz not null default now()
);

-- Migration for installs created before this fix: drop the email column
-- if it's still there, so old rows stop leaking addresses.
alter table public.profiles drop column if exists email;

alter table public.profiles enable row level security;

-- Any authenticated user can read these public fields (needed to render
-- friends on the leaderboard). No email is present in this table.
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
-- 4. user_emails: PRIVATE lookup table backing "add friend by email".
--    Nobody can SELECT anyone else's row — the only way to match an
--    address is the SECURITY DEFINER function in section 5, which
--    takes one exact email and never returns an email back.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.user_emails (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  updated_at timestamptz not null default now()
);

-- Case-insensitive uniqueness + fast exact lookup by lower(email).
create unique index if not exists user_emails_email_lower_idx
  on public.user_emails (lower(email));

alter table public.user_emails enable row level security;

-- Deliberately NO general select policy: a user can read only their own
-- row. Everyone else goes through find_user_by_email().
drop policy if exists "read own email" on public.user_emails;
create policy "read own email"
  on public.user_emails for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "insert own email" on public.user_emails;
create policy "insert own email"
  on public.user_emails for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "update own email" on public.user_emails;
create policy "update own email"
  on public.user_emails for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trg_user_emails_updated_at on public.user_emails;
create trigger trg_user_emails_updated_at
  before update on public.user_emails
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. find_user_by_email(): the ONLY path from an email to a user.
--
--    SECURITY DEFINER so it can read user_emails past RLS, but it
--    only ever accepts one exact (case-insensitive) address and
--    returns the matching user's PUBLIC profile fields — never an
--    email, never a list. No wildcard/LIKE, no way to enumerate.
--    Returns zero rows when there's no match or when called with a
--    blank argument.
--
--    Note: like any "add by email" feature, a caller can still test
--    whether one specific address they already know is registered.
--    That's inherent to the feature; what's fixed here is bulk
--    disclosure of every user's address.
-- ─────────────────────────────────────────────────────────────
drop function if exists public.find_user_by_email(text);
create or replace function public.find_user_by_email(p_email text)
returns table (
  user_id uuid,
  username text,
  avatar text,
  total_xp integer,
  level integer,
  fitness_index integer
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.avatar, p.total_xp, p.level, p.fitness_index
  from public.user_emails e
  join public.profiles p on p.user_id = e.user_id
  where p_email is not null
    and length(btrim(p_email)) > 0
    and lower(e.email) = lower(btrim(p_email))
    and e.user_id <> auth.uid()   -- never "find" yourself
  limit 1;
$$;

-- Only signed-in users may call it; revoke the implicit PUBLIC grant.
revoke all on function public.find_user_by_email(text) from public, anon;
grant execute on function public.find_user_by_email(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. friend_requests: pending/accepted/declined between two users.
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
-- 7. profiles.short_code: the immutable, unique short ID friends actually
--    search by (NOT email, NOT username — usernames aren't unique and can
--    change any time, see the "username" column above). Generated once,
--    server-side, on insert; a trigger blocks any later UPDATE from
--    changing it. profiles is already readable by every authenticated user
--    (see policy "read profiles (authenticated)" above), so a short_code
--    lookup is a plain SELECT — no SECURITY DEFINER function needed the
--    way email search required one, because a short code is MEANT to be
--    shared/discoverable, unlike an email address.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists short_code text;

-- Unambiguous alphabet: uppercase letters + digits, excluding characters
-- that are easy to misread (0/O, 1/I/L) since people will be typing these
-- in by hand from a screenshot or a message.
create or replace function public.generate_short_code()
returns text
language sql
as $$
  select string_agg(substr(alphabet, (random() * length(alphabet))::int + 1, 1), '')
  from (select 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' as alphabet) a,
       generate_series(1, 7);
$$;

create or replace function public.set_profile_short_code()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  tries int := 0;
begin
  if new.short_code is not null and length(new.short_code) > 0 then
    return new;
  end if;
  loop
    candidate := public.generate_short_code();
    exit when not exists (select 1 from public.profiles where short_code = candidate);
    tries := tries + 1;
    if tries > 20 then
      raise exception 'could not generate a unique short_code after 20 attempts';
    end if;
  end loop;
  new.short_code := candidate;
  return new;
end;
$$;

drop trigger if exists trg_profiles_short_code on public.profiles;
create trigger trg_profiles_short_code
  before insert on public.profiles
  for each row execute function public.set_profile_short_code();

-- Backfill any existing rows created before this column existed.
do $$
declare
  r record;
  candidate text;
  tries int;
begin
  for r in select user_id from public.profiles where short_code is null loop
    tries := 0;
    loop
      candidate := public.generate_short_code();
      exit when not exists (select 1 from public.profiles where short_code = candidate);
      tries := tries + 1;
      if tries > 20 then
        raise exception 'could not generate a unique short_code after 20 attempts for %', r.user_id;
      end if;
    end loop;
    update public.profiles set short_code = candidate where user_id = r.user_id;
  end loop;
end $$;

alter table public.profiles alter column short_code set not null;
create unique index if not exists profiles_short_code_idx on public.profiles (short_code);

-- Immutability: block any UPDATE that changes short_code, so it can't be
-- changed even by a bug elsewhere in the app, not just "the UI doesn't
-- expose a way to edit it."
create or replace function public.prevent_short_code_change()
returns trigger
language plpgsql
as $$
begin
  if new.short_code is distinct from old.short_code then
    raise exception 'short_code cannot be changed once set';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_short_code on public.profiles;
create trigger trg_profiles_protect_short_code
  before update on public.profiles
  for each row execute function public.prevent_short_code_change();

-- ─────────────────────────────────────────────────────────────
-- 8. friend_profiles: the EXTENDED profile shown on a friend's profile
--    screen — stat levels, fitness index, streak and unlocked
--    achievements.
--
--    SECURITY: this is deliberately a SEPARATE table from `profiles`
--    rather than more columns on it. `profiles` is readable by EVERY
--    authenticated user (policy "read profiles (authenticated)" above),
--    which it has to be for short-code friend search to work at all.
--    RLS is row-level, not column-level, so anything added to `profiles`
--    would immediately be world-readable to any signed-in account. This
--    table instead has its own policy that requires an ACCEPTED
--    friendship in either direction (see is_accepted_friend below), so
--    achievements/stats/streak are visible only to real friends.
--
--    Note what is NOT in here: quests, quest proof photos, nutrition
--    entries and raw body measurements (height/weight/personal records)
--    stay in game_states, which is readable only by its owner. Friends
--    never get access to those — only the derived, non-reversible
--    fitness_index is shared.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.friend_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stat_strength integer not null default 0,
  stat_intellect integer not null default 0,
  stat_will integer not null default 0,
  stat_appearance integer not null default 0,
  fitness_index integer,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  -- { achievement_id: unlocked_at_epoch_ms }, mirroring
  -- GameState.unlockedAchievements.
  achievements jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.friend_profiles enable row level security;

-- Is the CALLER an accepted friend of p_other (in either direction)?
--
-- SECURITY DEFINER so the check can't be weakened by whatever read policy
-- friend_requests happens to have, and so an RLS policy on this table
-- never recurses back through another table's policies. It's safe to
-- expose: it takes one user id the caller must already know and returns
-- only a boolean — never any rows — so it can't be used to enumerate
-- users or list anyone's friends.
create or replace function public.is_accepted_friend(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.friend_requests
    where status = 'accepted'
      and (
        (from_user = auth.uid() and to_user = p_other)
        or (from_user = p_other and to_user = auth.uid())
      )
  );
$$;

revoke all on function public.is_accepted_friend(uuid) from public, anon;
grant execute on function public.is_accepted_friend(uuid) to authenticated;

-- THE access rule: your own row, or the row of somebody you have an
-- accepted friend_request with. Pending/declined//no relationship → no
-- read. Deliberately NOT "using (true)" the way profiles is.
drop policy if exists "read own or friends extended profile" on public.friend_profiles;
create policy "read own or friends extended profile"
  on public.friend_profiles for select
  to authenticated
  using (auth.uid() = user_id or public.is_accepted_friend(user_id));

-- Writes are always self-only: nobody can write to anyone else's row.
drop policy if exists "insert own extended profile" on public.friend_profiles;
create policy "insert own extended profile"
  on public.friend_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "update own extended profile" on public.friend_profiles;
create policy "update own extended profile"
  on public.friend_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trg_friend_profiles_updated_at on public.friend_profiles;
create trigger trg_friend_profiles_updated_at
  before update on public.friend_profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 9. Auth settings (do this in the Dashboard, not SQL):
--    Authentication → Providers → Email: enable "Email" provider.
--    Authentication → URL Configuration: set Site URL and add your
--    dev/prod URLs (e.g. http://localhost:3000, your deployed domain)
--    to "Redirect URLs" so magic link emails send users back to the app.
-- ─────────────────────────────────────────────────────────────
