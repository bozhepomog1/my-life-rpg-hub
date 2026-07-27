import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useGameStateContext } from "@/lib/use-game-state-context";
import { ACHIEVEMENTS, applyAchievementUnlocks, type AchievementDef } from "@/lib/achievements";

const AUTO_DISMISS_MS = 4500;

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
  const [queue, setQueue] = useState<AchievementDef[]>([]);
  const [celebrating, setCelebrating] = useState<AchievementDef | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Detect newly unlocked ids and queue ALL of them (not just the first) —
  // two achievements can legitimately unlock in the same update (e.g. a
  // level-up that also crosses a quest-count threshold), and only showing
  // one while silently marking the other "seen" would drop it forever.
  useEffect(() => {
    if (!hydrated || !seen.current) return;
    const ids = Object.keys(state.unlockedAchievements);
    const newIds = ids.filter((id) => !seen.current!.has(id));
    if (newIds.length === 0) return;
    seen.current = new Set(ids);
    const defs = newIds
      .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
      .filter((d): d is AchievementDef => !!d);
    if (defs.length > 0) setQueue((q) => [...q, ...defs]);
  }, [state.unlockedAchievements, hydrated]);

  // Advance the queue whenever nothing is currently showing.
  useEffect(() => {
    if (celebrating || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCelebrating(next);
    setQueue(rest);
  }, [celebrating, queue]);

  // Auto-dismiss, keyed ONLY on `celebrating` — not on state.unlockedAchievements
  // or anything else that changes for unrelated reasons elsewhere in the app.
  // The previous version's effect was keyed on state.unlockedAchievements, so
  // any later, unrelated update to that object (or just a re-render that
  // happened to run before the timeout fired) tore down and rebuilt the
  // effect; its early-return-when-nothing-new path meant the replacement
  // never scheduled a new timer, leaving the toast stuck until reload. This
  // timer's lifecycle is now tied only to whether something is showing.
  useEffect(() => {
    if (!celebrating) return;
    dismissTimer.current = setTimeout(() => setCelebrating(null), AUTO_DISMISS_MS);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [celebrating]);

  function dismiss() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setCelebrating(null);
  }

  if (!celebrating || typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[130] flex justify-center px-4">
      <div className="animate-level-up pointer-events-auto relative rounded-2xl border border-primary/40 bg-card px-5 py-3 pr-9 text-center shadow-lg">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Закрыть уведомление"
          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X size={14} />
        </button>
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
