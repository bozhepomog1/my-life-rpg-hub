import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useGameStateContext } from "@/lib/use-game-state-context";
import { StatQuiz } from "@/components/StatQuiz";

// Same public-path exception as AuthGate — a logged-in user who hasn't
// resolved the quiz yet should still be able to read these without being
// blocked by it first.
const PUBLIC_PATHS = ["/privacy", "/terms"];

/**
 * Shows the starter stat quiz in place of the main interface for a
 * genuinely brand-new account (GameState.statQuizDone === false). Before
 * hydration finishes, just renders children as-is — each route already
 * shows its own LoadingScreen via `!hydrated`, so there's nothing extra to
 * gate here until we actually know one way or the other.
 */
export function StatQuizGate({ children }: { children: ReactNode }) {
  const { state, hydrated } = useGameStateContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>;
  if (hydrated && !state.statQuizDone) return <StatQuiz />;
  return <>{children}</>;
}
