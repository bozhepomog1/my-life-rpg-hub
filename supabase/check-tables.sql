-- ─────────────────────────────────────────────────────────────
-- Read-only check: which tables/functions from schema.sql actually
-- exist in THIS database right now?
--
-- Run this FIRST in the Supabase SQL Editor and read the results before
-- running friends-tables-migration.sql. Changes nothing.
-- ─────────────────────────────────────────────────────────────

-- 1. Tables. Expect all 4 rows back with exists = true. Any row that's
--    MISSING from the result entirely (not just false) means the table
--    doesn't exist at all in this database.
select
  t.table_name,
  exists (
    select 1 from information_schema.tables it
    where it.table_schema = 'public' and it.table_name = t.table_name
  ) as exists
from (values
  ('game_states'),
  ('profiles'),
  ('user_emails'),
  ('friend_requests')
) as t(table_name);

-- 2. The find_user_by_email() function.
select exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'find_user_by_email'
) as find_user_by_email_exists;

-- 3. The quest-photos storage bucket.
select exists (
  select 1 from storage.buckets where id = 'quest-photos'
) as quest_photos_bucket_exists;

-- 4. If you want a plain list instead of the checklist above, this shows
--    every public table Postgres actually knows about:
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
