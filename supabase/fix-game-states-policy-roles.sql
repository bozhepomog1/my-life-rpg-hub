-- Fix: game_states policies still scoped `to public` on the live DB,
-- while supabase/schema.sql has specified `to authenticated` for a while.
-- Found by scripts/verify-rls.ts test [11] ("RLS enabled everywhere, no
-- open policies") — pg_policies showed roles = {public} for
-- game_states.select/insert/update instead of {authenticated}.
--
-- Not exploitable today: the table-level `revoke all on game_states from
-- anon` (already applied) blocks anon regardless of the policy's own role
-- list, and every policy's USING/WITH CHECK still requires
-- auth.uid() = user_id either way. This just tightens the policy itself so
-- it matches schema.sql and doesn't rely solely on the table grant for
-- defense in depth.
--
-- Safe to re-run: drop-then-create, no data touched.

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

-- delete policy already correct (test [11] didn't flag it), included here
-- only so this file leaves the table in a fully consistent state.
drop policy if exists "delete own game_state" on public.game_states;
create policy "delete own game_state"
  on public.game_states for delete
  to authenticated
  using (auth.uid() = user_id);
