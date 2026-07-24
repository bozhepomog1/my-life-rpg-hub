import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthContext } from "./use-auth-context";
import { supabase } from "./supabase";
import { clearLegacyLocalState, defaultState, loadState, saveState, type GameState } from "./game";
import { syncProfile } from "./profiles";

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
  const email = user?.email ?? null;

  const [state, setState] = useState<GameState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load remote state on login; migrate any pre-auth local progress once.
  useEffect(() => {
    if (!userId) {
      setHydrated(false);
      return;
    }

    let cancelled = false;
    setHydrated(false);

    const cached = loadState(userId);
    if (cached) setState(cached);

    (async () => {
      const { data, error } = await supabase
        .from("game_states")
        .select("state")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (!error && data?.state) {
        const remote: GameState = {
          ...defaultState(),
          ...(data.state as Partial<GameState>),
          stats: { ...defaultState().stats, ...(data.state as GameState).stats },
        };
        setState(remote);
        saveState(remote, userId);
      } else {
        // No row for this user yet: migrate legacy anonymous local progress if
        // present, otherwise seed a fresh default state, then push to Supabase.
        const legacy = loadState();
        const initial = legacy ?? cached ?? defaultState();
        setState(initial);
        saveState(initial, userId);
        const { error: upsertError } = await supabase
          .from("game_states")
          .upsert({ user_id: userId, state: initial });
        if (!upsertError && legacy) clearLegacyLocalState();
      }

      if (!cancelled) setHydrated(true);
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
        .then(({ error }) => {
          if (error) console.warn("cloud save failed", error);
        });
      // Mirror the public-safe subset into `profiles` for friends/leaderboard.
      void syncProfile(userId, email, state);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated, userId, email]);

  const update = useCallback((fn: (s: GameState) => GameState) => {
    setState((prev) => fn(prev));
  }, []);

  return { state, setState, update, hydrated };
}
