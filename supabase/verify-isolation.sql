-- ─────────────────────────────────────────────────────────────
-- Data-isolation audit for Life RPG Hub.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New
-- query) to check what is ACTUALLY applied in the live database, as
-- opposed to what schema.sql says should be applied. Read-only: it
-- changes nothing.
--
-- Read the result of every section. Section 1 is the important one.
-- ─────────────────────────────────────────────────────────────

-- 1. Is Row Level Security actually ENABLED on every table?
--    Expected: rls_enabled = true for ALL FIVE rows.
--    If any row says false, that table is fully readable AND writable
--    by anyone holding the anon key (which ships in the public JS
--    bundle) — that is the worst case and must be fixed immediately by
--    re-running schema.sql.
select
  c.relname                as table_name,
  c.relrowsecurity         as rls_enabled,
  c.relforcerowsecurity    as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('game_states', 'profiles', 'user_emails', 'friend_requests')
order by c.relname;

-- 2. Which policies exist, and what do they actually check?
--    Expected for game_states: exactly 4 policies (select/insert/
--    update/delete), each with roles = {authenticated} and
--    qual/with_check containing "auth.uid() = user_id".
--    A policy whose qual is just "true" on game_states would mean
--    every signed-in user can read every other user's save file.
select
  tablename,
  policyname,
  cmd,
  roles,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 3. Table-level grants — what can the anon / authenticated roles do
--    before RLS is even consulted?
--    Expected: NO rows for grantee = 'anon' on game_states,
--    user_emails or friend_requests.
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in ('game_states', 'profiles', 'user_emails', 'friend_requests')
group by table_name, grantee
order by table_name, grantee;

-- 4. Sanity check on the data itself: one row per user, no orphans,
--    no duplicated user_id (which would break the "your row" model).
select
  (select count(*) from public.game_states)                        as game_state_rows,
  (select count(distinct user_id) from public.game_states)         as distinct_users,
  (select count(*) from public.profiles)                           as profile_rows,
  (select count(*)
     from public.game_states g
     left join auth.users u on u.id = g.user_id
    where u.id is null)                                            as orphaned_rows;

-- 5. Columns actually present on `profiles`.
--    Expected: user_id, username, avatar, total_xp, level,
--    fitness_index, updated_at — and NO `email` column. profiles is
--    readable by every signed-in user by design (it powers the friends
--    leaderboard), so anything sensitive must not live here.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- ─────────────────────────────────────────────────────────────
-- 6. THE REAL TEST — does RLS actually stop a specific user from
--    reading someone else's save file?
--
--    Sections 1-5 inspect configuration; this one proves behaviour.
--    Replace the UUID below with a real user id from
--    Dashboard → Authentication → Users, then run the whole block.
--
--    Expected: rows_visible = 1 (that user sees ONLY their own row).
--    If it returns more than 1, isolation is broken — stop and
--    re-run schema.sql.
-- ─────────────────────────────────────────────────────────────
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';

  select count(*) as rows_visible,
         count(*) filter (
           where user_id <> '00000000-0000-0000-0000-000000000000'::uuid
         ) as foreign_rows_visible   -- MUST be 0
  from public.game_states;
rollback;
