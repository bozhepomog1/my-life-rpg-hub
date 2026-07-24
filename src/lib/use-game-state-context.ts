import { useContext } from "react";
import { GameStateContext } from "./game-state-context-value";

export function useGameStateContext() {
  return useContext(GameStateContext);
}
