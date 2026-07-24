import type { ReactNode } from "react";
import { useGameState } from "@/lib/use-game-state";
import { GameStateContext } from "./game-state-context-value";

/**
 * Calls useGameState() exactly once for the whole app. Routes previously
 * each called useGameState() themselves, which meant switching tabs
 * unmounted/remounted the hook and re-ran its load-from-Supabase effect —
 * if that raced with the debounced save from a just-made edit (the save's
 * pending timeout gets cancelled on unmount), the fresh edit could be
 * silently overwritten by a stale server copy. Hoisting it here so state
 * persists across navigation fixes that at the root instead of per-field.
 */
export function GameStateProvider({ children }: { children: ReactNode }) {
  const value = useGameState();
  return <GameStateContext.Provider value={value}>{children}</GameStateContext.Provider>;
}
