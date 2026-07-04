import { useCallback, useEffect, useState } from "react";
import { defaultState, loadState, saveState, type GameState } from "./game";

export function useGameState() {
  const [state, setState] = useState<GameState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  const update = useCallback((fn: (s: GameState) => GameState) => {
    setState((prev) => fn(prev));
  }, []);

  return { state, setState, update, hydrated };
}
