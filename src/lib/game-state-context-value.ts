import { createContext } from "react";
import { defaultState, type GameState } from "@/lib/game";

export interface GameStateContextValue {
  state: GameState;
  setState: (s: GameState) => void;
  update: (fn: (s: GameState) => GameState) => void;
  hydrated: boolean;
}

export const GameStateContext = createContext<GameStateContextValue>({
  state: defaultState(),
  setState: () => {},
  update: () => {},
  hydrated: false,
});
