import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthContext } from "./use-auth-context";
import { supabase } from "./supabase";
import { clearLegacyLocalState, defaultState, loadState, saveState, type GameState } from "./game";
import { syncProfile } from "./profiles";
import { syncFriendProfile } from "./friend-profile";

const SAVE_DEBOUNCE_MS = 1000;

/**
 * Loads/saves GameState from Supabase (table game_states, one JSONB row per
 * user), with a per-user localStorage cache for instant reads and offline
 * resilience. Only usable while a user is signed in (AuthGate guarantees this
 * for anything that renders below it).
 */
export function useGameState() {
  const { user } = useAuthContext();
  const userId = user?.id ?? null;

  const [state, setState] = useState<GameState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  // True when the last attempt to reach Supabase for this user's state
  // failed (network down, etc.) — distinct from "no row yet", which is a
  // normal brand-new-user case, not an error. Lets the UI show a small
  // "не удалось синхронизироваться" notice instead of staying silent.
  const [syncError, setSyncError] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load remote state on login; migrate any pre-auth local progress once.
  useEffect(() => {
    if (!userId) {
      setHydrated(false);
      return;
    }

    let cancelled = false;
    setHydrated(false);
    setSyncError(false);

    // Purge the obsolete shared pre-auth cache if it's still sitting on this
    // device — it's no longer read by anything, and leaving another person's
    // progress blob in localStorage is exactly the exposure we just closed.
    clearLegacyLocalState();

    const cached = loadState(userId);
    if (cached) setState(cached);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("game_states")
          .select("state")
          .eq("user_id", userId)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          // A genuine fetch/query error (network down, RLS hiccup, etc.) is
          // NOT the same thing as "no row yet" — treating them alike used to
          // mean a transient outage could silently upsert a blank/cached
          // state over whatever's already saved server-side. Instead: keep
          // using the local cache (already applied above) or a fresh default
          // if there's nothing cached, don't touch the cloud row, and flag
          // it so the UI can tell the user sync isn't working right now.
          if (!cached) setState(defaultState());
          setSyncError(true);
        } else if (data?.state) {
          const remote: GameState = {
            ...defaultState(),
            ...(data.state as Partial<GameState>),
            stats: { ...defaultState().stats, ...(data.state as GameState).stats },
          };
          setState(remote);
          saveState(remote, userId);
        } else {
          // No row for this user yet → start from a clean default state.
          //
          // SECURITY: this used to fall back to loadState() with no userId,
          // reading the shared pre-auth localStorage key. On a device where
          // someone else had used the app, the next account to sign in
          // inherited THEIR entire progress (quests, nutrition, body stats)
          // and then wrote it into their own cloud row. That's a real
          // cross-account data leak on any shared/family/demo browser, so
          // the legacy migration is gone. `cached` below is per-user
          // (localCacheKey(userId)), so it's safe to keep.
          const initial = cached ?? defaultState();
          setState(initial);
          saveState(initial, userId);
          await supabase.from("game_states").upsert({ user_id: userId, state: initial });
        }
      } catch {
        // The fetch itself threw (e.g. completely offline) rather than
        // resolving with an `error` field. Same handling as the `error`
        // branch above — and critically, without this catch, `hydrated`
        // would never flip true and every route would show a loading state
        // forever instead of becoming usable from the local cache.
        if (!cancelled) {
          if (!cached) setState(defaultState());
          setSyncError(true);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Persist on change: local cache immediately, Supabase debounced.
  useEffect(() => {
    if (!hydrated || !userId) return;
    saveState(state, userId);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase
        .from("game_states")
        .upsert({ user_id: userId, state })
        .then(
          ({ error }) => {
            if (error) {
              console.warn("cloud save failed", error);
              setSyncError(true);
            } else {
              setSyncError(false);
            }
          },
          (err: unknown) => {
            // Same reasoning as the initial-load catch above: a thrown
            // network error here must not become an unhandled rejection or
            // silently vanish — surface it the same way as a returned error.
            // (Supabase's query builder returns a PromiseLike, not a full
            // Promise, so `.catch` isn't available — the two-arg `.then`
            // form is the portable equivalent.)
            console.warn("cloud save failed", err);
            setSyncError(true);
          },
        );
      // Mirror the public-safe subset into `profiles` for friends/leaderboard.
      void syncProfile(userId, state);
      // ...and the friends-only extended subset (stats/streak/achievements)
      // into `friend_profiles`, which is RLS-gated to accepted friends.
      void syncFriendProfile(userId, state);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated, userId]);

  const update = useCallback((fn: (s: GameState) => GameState) => {
    setState((prev) => fn(prev));
  }, []);

  return { state, setState, update, hydrated, syncError };
}
