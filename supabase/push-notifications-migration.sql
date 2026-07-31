-- Life RPG Hub — Web Push notifications
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query),
-- same as schema.sql. Safe to re-run.
--
-- Before running section 3 (pg_cron schedule) below, replace:
--   <SERVICE_ROLE_KEY>  with your project's service_role key
--                       (Dashboard → Project Settings → API → service_role secret)
-- The function URL already matches this project
-- (https://vvddprnytmlcsbxwiayr.supabase.co) — update it too if this schema
-- is ever run against a different Supabase project.
--
-- This mirrors game_states' existing "run by hand once" pattern — nothing
-- here can be scripted from inside the app itself, since it needs
-- dashboard-only secrets (service_role key) and the pg_cron/pg_net
-- extensions, which aren't reachable over the anon/authenticated client.

-- ─────────────────────────────────────────────────────────────
-- 1. push_subscriptions: one row per (user, device/browser).
--    A user can have several — one per device/browser they've enabled
--    reminders on — so this is NOT keyed by user_id alone like game_states.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Same defence-in-depth as game_states: anon (signed-out) is blocked outright,
-- not just by policy.
revoke all on public.push_subscriptions from anon;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- A user can only ever see/create/remove THEIR OWN subscription rows. No
-- update policy — the client deletes-then-inserts on re-subscribe (see
-- src/lib/push.ts) instead of updating in place, so there's nothing to allow.
drop policy if exists "select own push subscriptions" on public.push_subscriptions;
create policy "select own push subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "insert own push subscriptions" on public.push_subscriptions;
create policy "insert own push subscriptions"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "delete own push subscriptions" on public.push_subscriptions;
create policy "delete own push subscriptions"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Extensions pg_cron needs to reach an Edge Function over HTTP.
--    Both are already enabled by default on Supabase projects, but
--    `create extension if not exists` is harmless if so.
-- ─────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- 3. Daily schedule: 20:00 UTC, matching the old client-side REMINDER_HOUR
--    (20:00 local time) as a starting point. This does NOT yet account for
--    each user's own timezone — everyone gets pinged at the same UTC
--    instant regardless of where they are. Deliberately left as a simple v1
--    (per the brief: "не усложняй сейчас") — a real per-user-timezone
--    schedule would mean either many more cron entries or moving the
--    per-user "is it evening for them yet" decision inside the function and
--    running it more often (e.g. hourly) instead of once — a bigger change
--    better done as its own follow-up.
--
-- Replace <SERVICE_ROLE_KEY> below before running this block.
-- ─────────────────────────────────────────────────────────────
select cron.schedule(
  'send-daily-reminders',
  '0 20 * * *',
  $$
  select net.http_post(
    url := 'https://vvddprnytmlcsbxwiayr.supabase.co/functions/v1/send-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To change the time later, or inspect/remove the schedule:
--   select * from cron.job;
--   select cron.unschedule('send-daily-reminders');
