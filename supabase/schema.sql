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

-- Read access is NARROW: own row only at this point in the file. It gets
-- widened to "own row + accepted friends" in section 9, once
-- is_accepted_friend() exists (a policy can't reference a function that
-- hasn't been created yet, and that function is defined down in section 8).
--
-- This used to be `using (true)` — which meant any authenticated user could
-- dump the entire table (every username, avatar, XP, level, fitness index
-- and short_code in the app) with a single direct API call, bypassing the
-- UI that only ever showed them their friends. See section 9 and
-- privacy-migration.sql: friend search by short code now goes through the
-- SECURITY DEFINER find_profile_by_code() instead of a blanket read, the
-- same way email search already went through find_user_by_email().
drop policy if exists "read profiles (authenticated)" on public.profiles;
drop policy if exists "read own and friends profiles" on public.profiles;
create policy "read own and friends profiles"
  on public.profiles for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.profiles from anon;

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
-- 9. Profile privacy + locking down bulk reads of `profiles`.
--
--    Kept identical to privacy-migration.sql (which is what an existing
--    install runs); this section is here so a FRESH install from schema.sql
--    alone ends up in exactly the same state. See that file's header for
--    the full rationale — short version:
--
--    • profiles was `using (true)`: any signed-in user could dump the whole
--      user table via a direct API call. Now: own row + accepted friends.
--    • "Soft" privacy: being found by short code and receiving a friend
--      request works for EVERYONE regardless of is_private. What privacy
--      changes is that a NON-friend sees only name + avatar, never progress.
--    • Accepted friends of a private user see everything as normal —
--      privacy never applies between friends.
--    • Column-level hiding isn't expressible in RLS (it's row-level), so
--      the redaction lives in the SECURITY DEFINER functions below while
--      the table itself stays locked down.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_private boolean not null default false;

-- Widen the placeholder policy from section 3 now that is_accepted_friend()
-- exists. Pending-request counterparts deliberately go through
-- get_visible_profiles() instead of being allowed here, because they must
-- see a REDACTED row for a private user and RLS can't drop columns.
drop policy if exists "read own and friends profiles" on public.profiles;
create policy "read own and friends profiles"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_accepted_friend(user_id)
  );

create or replace function public.has_pending_request_with(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.friend_requests
    where status = 'pending'
      and (
        (from_user = auth.uid() and to_user = p_other)
        or (from_user = p_other and to_user = auth.uid())
      )
  );
$$;

revoke all on function public.has_pending_request_with(uuid) from public, anon;
grant execute on function public.has_pending_request_with(uuid) to authenticated;

-- Rate-limited via public.check_rate_limit (section 11, further down —
-- forward reference is fine, plpgsql bodies resolve other functions by
-- name at call time, not at CREATE time, and section 11 has always run by
-- the time this is actually called). 20 lookups/hour: generous for a human
-- retrying a typo'd code, a hard stop on brute-forcing the short_code
-- space. `language sql / stable` became `plpgsql` (no longer stable, since
-- it now writes) so a rate-limited call can `raise exception` with a
-- distinguishable message instead of silently returning nothing — see
-- rate-limiting-migration.sql for the fuller writeup.
drop function if exists public.find_profile_by_code(text);
create or replace function public.find_profile_by_code(p_code text)
returns table (
  user_id uuid,
  username text,
  avatar text,
  total_xp integer,
  level integer,
  fitness_index integer,
  short_code text,
  is_private boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.check_rate_limit('find_profile_by_code', 20, 3600) then
    raise exception 'RATE_LIMITED: too many code lookups, try again in a bit';
  end if;

  return query
    select
      p.user_id,
      p.username,
      p.avatar,
      case when not p.is_private or public.is_accepted_friend(p.user_id)
           then p.total_xp end,
      case when not p.is_private or public.is_accepted_friend(p.user_id)
           then p.level end,
      case when not p.is_private or public.is_accepted_friend(p.user_id)
           then p.fitness_index end,
      p.short_code,
      p.is_private
    from public.profiles p
    where p_code is not null
      and length(btrim(p_code)) > 0
      and p.short_code = upper(btrim(p_code))
      and p.user_id <> auth.uid()
    limit 1;
end;
$$;

revoke all on function public.find_profile_by_code(text) from public, anon;
grant execute on function public.find_profile_by_code(text) to authenticated;

drop function if exists public.get_visible_profiles(uuid[]);
create or replace function public.get_visible_profiles(p_user_ids uuid[])
returns table (
  user_id uuid,
  username text,
  avatar text,
  total_xp integer,
  level integer,
  fitness_index integer,
  short_code text,
  is_private boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    p.user_id,
    p.username,
    p.avatar,
    case when not p.is_private or public.is_accepted_friend(p.user_id)
         then p.total_xp end,
    case when not p.is_private or public.is_accepted_friend(p.user_id)
         then p.level end,
    case when not p.is_private or public.is_accepted_friend(p.user_id)
         then p.fitness_index end,
    p.short_code,
    p.is_private
  from public.profiles p
  where p.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and (
      p.user_id = auth.uid()
      or public.is_accepted_friend(p.user_id)
      or public.has_pending_request_with(p.user_id)
    );
$$;

revoke all on function public.get_visible_profiles(uuid[]) from public, anon;
grant execute on function public.get_visible_profiles(uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 10. RLS audit fixes.
--
--    Kept identical to rls-audit-fixes.sql (which is what an existing
--    install runs); this section exists so a FRESH install from schema.sql
--    alone ends up in exactly the same state. See that file's header for
--    the full audit write-up of every table. Short version of what was
--    wrong and is fixed below:
--
--    • friend_requests INSERT accepted any status — so a single direct API
--      call with status='accepted' made you an accepted friend of any user
--      whose uuid you knew, with zero action from them. That unlocks
--      is_accepted_friend() → their friend_profiles row (stats, streaks,
--      achievements) and their full profiles row even when private.
--      Now: insert is forced to status='pending', and no self-requests.
--    • friend_requests UPDATE let the SENDER accept their own request
--      (same escalation, one step longer). Now: only the recipient
--      (to_user) may update.
--    • friend_requests UPDATE let either party rewrite from_user/to_user,
--      forging a friendship with an uninvolved third party. WITH CHECK
--      can't express "this column may not change", so a trigger does it.
--    • user_emails let you store ANY address in your own row, letting you
--      squat an unregistered address and be found as its owner. Now a
--      SECURITY DEFINER trigger requires it to match auth.users.email.
--    • Missing DELETE policies (profiles, friend_profiles, user_emails)
--      and missing anon revokes on friend_requests/friend_profiles/
--      user_emails — both fail-closed already, completed here.
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'friend_requests_no_self'
  ) then
    alter table public.friend_requests
      add constraint friend_requests_no_self check (from_user <> to_user) not valid;
  end if;
end $$;

drop policy if exists "send friend_request" on public.friend_requests;
create policy "send friend_request"
  on public.friend_requests for insert
  to authenticated
  with check (
    auth.uid() = from_user
    and from_user <> to_user
    and status = 'pending'
  );

drop policy if exists "update own friend_requests" on public.friend_requests;
drop policy if exists "respond to received friend_request" on public.friend_requests;
create policy "respond to received friend_request"
  on public.friend_requests for update
  to authenticated
  using (auth.uid() = to_user)
  with check (auth.uid() = to_user);

create or replace function public.enforce_friend_request_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.from_user is distinct from old.from_user
     or new.to_user is distinct from old.to_user then
    raise exception 'friend_request participants cannot be changed';
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'friend_request identity/created_at cannot be changed';
  end if;
  if new.status not in ('accepted', 'declined') then
    raise exception 'friend_request status can only be changed to accepted or declined';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_friend_requests_guard on public.friend_requests;
create trigger trg_friend_requests_guard
  before update on public.friend_requests
  for each row execute function public.enforce_friend_request_update();

create or replace function public.enforce_own_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  real_email text;
begin
  select u.email into real_email from auth.users u where u.id = new.user_id;
  if real_email is null then
    raise exception 'no auth user for %', new.user_id;
  end if;
  if lower(btrim(new.email)) is distinct from lower(btrim(real_email)) then
    raise exception 'user_emails.email must match the account''s own email';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_emails_own_address on public.user_emails;
create trigger trg_user_emails_own_address
  before insert or update on public.user_emails
  for each row execute function public.enforce_own_email();

drop policy if exists "delete own profile" on public.profiles;
create policy "delete own profile"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "delete own extended profile" on public.friend_profiles;
create policy "delete own extended profile"
  on public.friend_profiles for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "delete own email" on public.user_emails;
create policy "delete own email"
  on public.user_emails for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.friend_requests from anon;
grant select, insert, update, delete on public.friend_requests to authenticated;
revoke all on public.friend_profiles from anon;
grant select, insert, update, delete on public.friend_profiles to authenticated;
revoke all on public.user_emails from anon;
grant select, insert, update, delete on public.user_emails to authenticated;
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

-- Storage policies restated with an explicit `to authenticated` and an
-- explicit WITH CHECK on UPDATE (see section 2 — this bucket also holds
-- avatars and backgrounds, all under the same "<user_id>/..." prefix).
drop policy if exists "read own quest photos" on storage.objects;
create policy "read own quest photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "upload own quest photos" on storage.objects;
create policy "upload own quest photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "update own quest photos" on storage.objects;
create policy "update own quest photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "delete own quest photos" on storage.objects;
create policy "delete own quest photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.generate_short_code() set search_path = public, pg_temp;
alter function public.set_profile_short_code() set search_path = public, pg_temp;
alter function public.prevent_short_code_change() set search_path = public, pg_temp;

-- NOTE: push_subscriptions (and its RLS) lives in
-- push-notifications-migration.sql, not here — run that file too. It is
-- also restated in rls-audit-fixes.sql for exactly this reason.

-- ─────────────────────────────────────────────────────────────
-- 11. Rate limiting for expensive/sensitive per-user operations.
--
--    Kept identical to rate-limiting-migration.sql (what an existing
--    install runs); this section exists so a FRESH install from schema.sql
--    alone ends up in exactly the same state. See that file's header for
--    the full design writeup — short version: one shared table + one
--    SECURITY DEFINER function, called from parse-meal-text/parse-meal-photo
--    (Edge Functions, guards against unmetered Claude API spend) and from
--    find_profile_by_code() below in section 7 (guards against short_code
--    brute-force enumeration).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  request_count integer not null default 0,
  primary key (user_id, action)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;

drop function if exists public.check_rate_limit(text, integer, integer);
create or replace function public.check_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    return false;
  end if;

  insert into public.rate_limits (user_id, action, window_start, request_count)
  values (v_user, p_action, now(), 1)
  on conflict (user_id, action) do update
    set request_count = case
          when public.rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
            then 1
          else public.rate_limits.request_count + 1
        end,
        window_start = case
          when public.rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
            then now()
          else public.rate_limits.window_start
        end
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 12. Auth settings (do this in the Dashboard, not SQL):
--    Authentication → Providers → Email: enable "Email" provider.
--    Authentication → URL Configuration: set Site URL and add your
--    dev/prod URLs (e.g. http://localhost:3000, your deployed domain)
--    to "Redirect URLs" so magic link emails send users back to the app.
-- ─────────────────────────────────────────────────────────────
