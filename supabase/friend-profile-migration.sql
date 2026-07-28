-- ─────────────────────────────────────────────────────────────
-- Adds friend_profiles — the extended profile a FRIEND can see
-- (schema.sql section 8, copied verbatim). Run in the Supabase SQL Editor.
--
-- Requires friend_requests and the set_updated_at() trigger function to
-- already exist — if check-tables.sql showed friend_requests missing, run
-- friends-tables-migration.sql FIRST, then this file.
--
-- Idempotent: safe to re-run (create table if not exists / create or
-- replace function / drop-then-create for policies and triggers).
--
-- ── The security rule, in one line ───────────────────────────
-- SELECT on friend_profiles is allowed only for your OWN row, or for a
-- user you have an ACCEPTED friend_request with (either direction).
-- Everything else — pending requests, declined requests, strangers — is
-- denied. This is why the data lives here and not in `profiles`, which is
-- readable by every authenticated user (needed for short-code search) and
-- would therefore have exposed achievements/stats to anyone signed in.
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

-- Defensive: needed by the trigger below, harmless if already defined.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Is the CALLER an accepted friend of p_other (in either direction)?
--
-- SECURITY DEFINER so the check can't be weakened by whatever read policy
-- friend_requests happens to have, and so an RLS policy on this table
-- never recurses back through another table's policies. Safe to expose:
-- takes one user id the caller must already know, returns only a boolean
-- — never any rows — so it can't enumerate users or list anyone's friends.
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

-- THE access rule. Deliberately NOT "using (true)" the way profiles is.
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
-- Optional sanity check. Run this from the app (browser console, while
-- signed in) rather than the SQL editor — the SQL editor connects as a
-- privileged role where auth.uid() is null and RLS doesn't apply, so it
-- can't demonstrate the rule:
--
--   await supabase.from("friend_profiles").select("user_id")
--
-- Expect exactly: your own row + your ACCEPTED friends' rows. A
-- stranger's row must NOT appear, even though that same user IS visible
-- in public.profiles (which is intentionally world-readable so friend
-- search by short code can work).
-- ─────────────────────────────────────────────────────────────
