import { createContext } from "react";
import { defaultState, type GameState } from "@/lib/game";

export interface GameStateContextValue {
  state: GameState;
  setState: (s: GameState) => void;
  update: (fn: (s: GameState) => GameState) => void;
  hydrated: boolean;
  /** True when the last Supabase sync attempt failed — see use-game-state.ts. */
  syncError: boolean;
}

export const GameStateContext = createContext<GameStateContextValue>({
  state: defaultState(),
  setState: () => {},
  update: () => {},
  hydrated: false,
  syncError: false,
});
