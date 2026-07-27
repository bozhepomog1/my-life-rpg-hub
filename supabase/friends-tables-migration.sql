-- ─────────────────────────────────────────────────────────────
-- Missing-parts migration: profiles, user_emails, find_user_by_email(),
-- friend_requests — i.e. sections 3-6 of schema.sql, copied verbatim.
--
-- Run check-tables.sql FIRST. If it shows profiles/friend_requests (and
-- likely user_emails + find_user_by_email) missing, run this file to add
-- just those — it does NOT touch game_states or the quest-photos bucket,
-- which check-tables.sql should confirm already exist and are working.
--
-- Safe to run even if some of these already exist: every statement uses
-- IF NOT EXISTS / CREATE OR REPLACE / DROP-then-CREATE for policies, so
-- re-running a piece that's already there is a no-op, not a reset.
-- ─────────────────────────────────────────────────────────────

-- Needed by the triggers below; defined here defensively in case
-- game_states' section of schema.sql was applied via a path that didn't
-- include it (harmless to redefine if it already exists).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
