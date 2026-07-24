import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGameStateContext } from "@/lib/use-game-state-context";
import { ACHIEVEMENTS, applyAchievementUnlocks, type AchievementDef } from "@/lib/achievements";

/**
 * Mounted once at the app root (inside GameStateProvider, alongside
 * <Outlet/>) so achievement unlocks are checked and celebrated regardless of
 * which tab the user is on — not just from the Achievements page itself.
 *
 * Re-checks the achievements that can be derived purely from GameState
 * (streak/level/stats/nutrition/quests/deposit) whenever those values
 * change. Social achievements (friends/leaderboard) need data that only the
 * Friends page has loaded, so FriendsPanel runs its own
 * applyAchievementUnlocks() call with that context — this watcher only
 * needs to notice the resulting unlock and celebrate it, which it does via
 * the shared state.unlockedAchievements diff below.
 */
export function AchievementWatcher() {
  const { state, update, hydrated } = useGameStateContext();
  const [celebrating, setCelebrating] = useState<AchievementDef | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const nutritionEntryCount = useMemo(
    () => Object.values(state.nutrition).reduce((sum, d) => sum + d.entries.length, 0),
    [state.nutrition],
  );

  // Seed the "already known" set on first hydration so achievements earned
  // before this session (or before this feature existed) don't celebrate.
  useEffect(() => {
    if (!hydrated || seen.current) return;
    seen.current = new Set(Object.keys(state.unlockedAchievements));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Re-run the state-derived checks whenever the relevant values change.
  useEffect(() => {
    if (!hydrated) return;
    update((s) => applyAchievementUnlocks(s));
  }, [
    hydrated,
    state.completedCount,
    state.level,
    state.longestStreak,
    state.stats.strength.level,
    state.stats.intellect.level,
    state.stats.will.level,
    state.stats.appearance.level,
    nutritionEntryCount,
    update,
  ]);

  // Celebrate any id that wasn't in the "seen" set yet.
  useEffect(() => {
    if (!hydrated || !seen.current) return;
    const ids = Object.keys(state.unlockedAchievements);
    const newIds = ids.filter((id) => !seen.current!.has(id));
    if (newIds.length === 0) return;
    seen.current = new Set(ids);
    const def = ACHIEVEMENTS.find((a) => a.id === newIds[0]);
    if (!def) return;
    setCelebrating(def);
    const t = setTimeout(() => setCelebrating(null), 3800);
    return () => clearTimeout(t);
  }, [state.unlockedAchievements, hydrated]);

  if (!celebrating || typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[130] flex justify-center px-4">
      <div className="animate-level-up rounded-2xl border border-primary/40 bg-card px-5 py-3 text-center shadow-lg">
        <div className="text-2xl leading-none">{celebrating.icon}</div>
        <div className="mt-1 text-[11px] font-medium tracking-wide text-muted-foreground">
          Достижение разблокировано
        </div>
        <div className="text-sm font-semibold text-foreground">{celebrating.title}</div>
      </div>
    </div>,
    document.body,
  );
}
