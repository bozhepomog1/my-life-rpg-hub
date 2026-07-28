import { useState } from "react";
import { STAT_META, type QuestIdeaTemplate } from "@/lib/game";

interface Props {
  /** STARTER_QUEST_IDEAS from game.ts — a small, friction-free subset of QUEST_IDEA_POOL. */
  ideas: QuestIdeaTemplate[];
  onAdd: (templates: QuestIdeaTemplate[]) => void;
  onSkip: () => void;
}

/**
 * One-time empty-state prompt for a brand-new account's "Ежедневные" tab
 * (see showDailyOnboarding in index.tsx). Daily quests are no longer an
 * auto-rotated pool — the user builds their own list by hand — so this is
 * just a soft, skippable suggestion to get started with a few common
 * habits, not a recurring nudge. Shown once; dismissed either way (adding
 * some, or skipping) permanently hides it (dailyOnboardingDismissed).
 */
export function DailyOnboardingPrompt({ ideas, onAdd, onSkip }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function submit() {
    onAdd(ideas.filter((_, i) => selected.has(i)));
  }

  return (
    <div className="panel p-6">
      <div className="text-3xl">🌅</div>
      <h3 className="mt-2 text-sm font-semibold text-foreground">
        Начни свой список ежедневных квестов
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Вот несколько идей для старта — отметь понравившиеся и добавь одним нажатием, или пропусти и
        начни с чистого листа. Свои квесты можно добавить в любой момент через кнопку ниже.
      </p>

      <ul className="mt-4 space-y-1.5">
        {ideas.map((idea, i) => {
          const meta = STAT_META[idea.stat];
          const checked = selected.has(i);
          return (
            <li key={idea.title}>
              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  checked ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(i)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="shrink-0 text-sm" style={{ color: meta.color }}>
                  {meta.icon}
                </span>
                <span className="min-w-0 flex-1">{idea.title}</span>
                <span className="shrink-0 text-xs font-medium text-primary">+{idea.reward} XP</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
        >
          Пропустить
        </button>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={submit}
          className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Добавить выбранное {selected.size > 0 ? `(${selected.size})` : ""}
        </button>
      </div>
    </div>
  );
}
