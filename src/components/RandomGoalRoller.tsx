import { useState } from "react";
import {
  randomBigGoalIdea,
  recordBigGoalShown,
  STAT_META,
  type BigGoalIdea,
  type GameState,
} from "@/lib/game";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  // Opens AddQuestModal pre-filled with the idea, rather than saving it
  // directly — the request specifically wants the wording editable before
  // it's actually saved, so this never creates a quest by itself.
  onAddAsIs: (idea: BigGoalIdea) => void;
}

/**
 * "🎲 Случайная цель" button for "Крупные цели": rolls one random idea from
 * BIG_GOAL_IDEAS and offers to add it (opening it pre-filled in
 * AddQuestModal for editing), reroll for another, or close. Rerolling is
 * unlimited — each tap swaps in a fresh idea, excluding not just the one
 * currently shown but the last several shown (persisted in GameState via
 * recordBigGoalShown), so closing the roller and reopening it — or even
 * reloading the page — still won't immediately resurface the same handful
 * of ideas.
 */
export function RandomGoalRoller({ state, update, onAddAsIs }: Props) {
  const [idea, setIdea] = useState<BigGoalIdea | null>(null);

  function roll() {
    const next = randomBigGoalIdea(state.recentBigGoalTitles);
    setIdea(next);
    update((s) => recordBigGoalShown(s, next.title));
  }

  if (!idea) {
    return (
      <button
        type="button"
        onClick={roll}
        className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      >
        🎲 Случайная цель
      </button>
    );
  }

  const meta = STAT_META[idea.stat];
  return (
    <div className="panel mb-3 p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.color }}>
        {meta.icon} {meta.label}
        <span className="ml-auto shrink-0 text-primary">+{idea.reward} XP</span>
      </div>
      <p className="mt-1.5 text-sm text-foreground">{idea.title}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            onAddAsIs(idea);
            setIdea(null);
          }}
          className="btn-accent-hover rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:-translate-y-0.5"
        >
          Добавить как есть
        </button>
        <button
          type="button"
          onClick={roll}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
        >
          Ещё вариант
        </button>
        <button
          type="button"
          onClick={() => setIdea(null)}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
