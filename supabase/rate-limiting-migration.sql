-- Rate limiting for expensive/sensitive per-user operations.
-- Run this once in the Supabase SQL editor. Safe to re-run (drop-then-create).
--
-- WHAT THIS PROTECTS (as of this migration):
--   • parse-meal-text / parse-meal-photo Edge Functions — each request is a
--     metered Claude API call paid for from this project's own API key.
--     Nothing stopped one account from calling either in a loop before this.
--   • find_profile_by_code() — a normal, cheap lookup, but it's also the
--     exact enumeration vector a short (a handful of chars) code space is
--     vulnerable to: unlimited attempts means a short_code is eventually
--     brute-forceable. See schema.sql section 7 for the code itself.
--
-- HOW IT WORKS (shared by both — one table, one function, so future callers
-- reuse this instead of inventing another counter):
--   `rate_limits` holds one row per (user_id, action) with a `window_start`
--   and a `request_count`. `check_rate_limit(action, limit, window_seconds)`
--   is a SECURITY DEFINER upsert: each call either increments the counter
--   (same window) or resets it to 1 (window has expired), and returns
--   whether the NEW count is still within the limit. It's a fixed-window
--   counter, not a true sliding window — simpler, and plenty precise for
--   "catch anomalous frequency", which is the actual goal here (not
--   billing-grade precision).
--
--   Callers:
--     - Edge Functions (Deno) call it like any other RPC:
--       `supabase.rpc("check_rate_limit", { p_action: "parse_meal_text", ... })`
--       using the same client that already carries the user's JWT (the
--       existing auth.getUser() call in each function), so auth.uid() inside
--       resolves to that same user — no separate plumbing needed.
--     - SQL functions (find_profile_by_code) call it directly as
--       `public.check_rate_limit(...)` in their own body.
--
--   The table itself has RLS enabled but NO policies and no direct grants to
--   anon/authenticated — the only way in is through the SECURITY DEFINER
--   function (owned by the same role that owns the table, so it isn't
--   subject to RLS itself). Same defense-in-depth shape as every other
--   SECURITY DEFINER function in this schema (find_user_by_email,
--   is_accepted_friend, etc.).
--
--   To add rate limiting to a new expensive/sensitive action later: just
--   call `public.check_rate_limit('your_action_name', <limit>, <window_seconds>)`
--   from wherever that action is implemented — no new table or function needed.

create table if not exists public.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  request_count integer not null default 0,
  primary key (user_id, action)
);

alter table public.rate_limits enable row level security;
-- No policies on purpose — this table is only ever touched through
-- check_rate_limit() below (SECURITY DEFINER, owned by the same role that
-- owns this table, so it isn't itself subject to RLS). Direct access from
-- any client role is denied by omission, and belt-and-suspenders by revoke:
revoke all on public.rate_limits from public, anon, authenticated;

-- Atomically records one attempt of `p_action` by the current user and
-- reports whether they're still within `p_limit` calls per `p_window_seconds`.
-- Returns false (blocked) rather than raising by itself — callers decide how
-- to surface that (an HTTP 200 with a friendly note for Edge Functions, a
-- raised exception with a distinguishable message for SQL functions like
-- find_profile_by_code).
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
  -- No session to attribute the attempt to — fail closed (deny) rather than
  -- let an unauthenticated caller through unmetered. Every current caller
  -- already requires a logged-in user before reaching this point anyway.
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
