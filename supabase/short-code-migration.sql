-- ─────────────────────────────────────────────────────────────
-- Adds the immutable short friend-code to `profiles` (schema.sql
-- section 7, copied verbatim). Run this in the Supabase SQL Editor.
--
-- Requires profiles to already exist — if check-tables.sql showed it
-- missing, run friends-tables-migration.sql FIRST, then this file.
--
-- Idempotent: safe to re-run. The backfill loop only touches rows that
-- still have short_code = null, and the two trigger functions are
-- CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists short_code text;

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

-- Immutability: block any UPDATE that changes short_code.
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
-- Optional cleanup (NOT run automatically): once you've confirmed friend
-- search works by code, user_emails/find_user_by_email() are no longer
-- used by the app anywhere — the client stopped writing to user_emails
-- and stopped calling find_user_by_email() as part of this change. They're
-- left in place so existing data isn't destroyed without you asking for
-- it. If you want to remove them later:
--
--   drop function if exists public.find_user_by_email(text);
--   drop table if exists public.user_emails;
-- ─────────────────────────────────────────────────────────────
