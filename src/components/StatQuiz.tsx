import { useState } from "react";
import {
  applyQuizResults,
  QUIZ_QUESTIONS,
  skipQuiz,
  STAT_META,
  STAT_ORDER,
  type StatKey,
} from "@/lib/game";
import { useGameStateContext } from "@/lib/use-game-state-context";

/**
 * Blocks the main interface for a genuinely brand-new account (gated by
 * GameState.statQuizDone — see StatQuizGate) with a short 20-question quiz
 * (5 per stat), then converts answers into proportional starting XP via
 * applyQuizResults(). "Пропустить" skips straight to a blank-slate account,
 * same as before this feature existed.
 */
export function StatQuiz() {
  const { update } = useGameStateContext();
  const [index, setIndex] = useState(0);
  const [points, setPoints] = useState<Record<StatKey, number>>({
    strength: 0,
    intellect: 0,
    will: 0,
    appearance: 0,
  });

  const total = QUIZ_QUESTIONS.length;
  const question = QUIZ_QUESTIONS[index];
  const meta = STAT_META[question.stat];

  function choose(optionPoints: number) {
    const nextPoints = { ...points, [question.stat]: points[question.stat] + optionPoints };
    setPoints(nextPoints);
    if (index + 1 < total) {
      setIndex(index + 1);
    } else {
      update((s) => applyQuizResults(s, nextPoints));
    }
  }

  function skip() {
    update((s) => skipQuiz(s));
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="panel-glow w-full max-w-lg p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-primary">Life RPG</div>
            <h1 className="mt-0.5 text-lg font-semibold">Небольшой тест перед стартом</h1>
          </div>
          <button
            type="button"
            onClick={skip}
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:bg-secondary"
          >
            Пропустить, начать с нуля
          </button>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          20 вопросов про твои реальные привычки — по ним начислим стартовые очки в каждую
          характеристику и подберём архетип. Отвечай как есть, тут нет правильных ответов.
        </p>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Вопрос {index + 1} из {total}
            </span>
            <span style={{ color: meta.color }}>
              {meta.icon} {meta.label}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        <h2 className="mt-5 text-base font-medium leading-snug sm:text-lg">{question.text}</h2>

        <div className="mt-4 grid gap-2">
          {question.options.map((opt) => (
            <button
              key={opt.text}
              type="button"
              onClick={() => choose(opt.points)}
              className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-secondary"
            >
              {opt.text}
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-center gap-1.5">
          {STAT_ORDER.map((k) => (
            <span
              key={k}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: k === question.stat ? STAT_META[k].color : "var(--color-border)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
