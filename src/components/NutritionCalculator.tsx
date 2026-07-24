import { useState } from "react";
import { ProgressBar } from "@/components/ProgressBar";
import { STAT_META, type GameState } from "@/lib/game";
import {
  addNutritionEntry,
  getTodayNutrition,
  NUTRITION_GOALS,
  parseMeal,
  type ParsedMeal,
} from "@/lib/nutrition";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}

const METRICS = [
  { key: "kcal", label: "Ккал", unit: "", color: STAT_META.strength.color },
  { key: "protein", label: "Белки", unit: "г", color: STAT_META.intellect.color },
  { key: "fat", label: "Жиры", unit: "г", color: STAT_META.will.color },
  { key: "carbs", label: "Углеводы", unit: "г", color: STAT_META.appearance.color },
] as const;

export function NutritionCalculator({ state, update }: Props) {
  const [text, setText] = useState("");
  const [computing, setComputing] = useState(false);
  const [lastResult, setLastResult] = useState<ParsedMeal | null>(null);
  const [notFound, setNotFound] = useState(false);

  const today = getTodayNutrition(state);

  function handleCalculate() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setComputing(true);
    setNotFound(false);
    setLastResult(null);
    // Small delay purely so "Считаем…" is visible as feedback — this is a
    // local keyword lookup, not a remote/AI call.
    setTimeout(() => {
      const parsed = parseMeal(trimmed);
      setComputing(false);
      if (!parsed) {
        setNotFound(true);
        return;
      }
      setLastResult(parsed);
      update((s) => addNutritionEntry(s, trimmed, parsed.totals));
      setText("");
    }, 300);
  }

  return (
    <div className="space-y-5">
      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Что ты съел?</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Опиши простыми словами, например: 2 яйца, тост, кофе с молоком
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="2 яйца, тост, кофе с молоком…"
          className="mt-3 w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={handleCalculate}
          disabled={!text.trim() || computing}
          className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {computing ? "Считаем…" : "Посчитать"}
        </button>

        {notFound && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Не удалось распознать блюдо, попробуй описать проще (например: 2 яйца, тост, кофе)
          </p>
        )}

        {lastResult && (
          <div className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Распознано:</div>
            <ul className="mt-1 space-y-0.5">
              {lastResult.items.map((it, i) => (
                <li key={i}>
                  {it.label}
                  {it.qty > 1 ? ` × ${it.qty}` : ""} — {Math.round(it.kcal)} ккал
                </li>
              ))}
            </ul>
            <div className="mt-1.5 font-medium text-foreground">
              Итого: {Math.round(lastResult.totals.kcal)} ккал · Б{" "}
              {Math.round(lastResult.totals.protein)} · Ж {Math.round(lastResult.totals.fat)} · У{" "}
              {Math.round(lastResult.totals.carbs)}
            </div>
          </div>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="mb-4 text-sm font-semibold">Прогресс дня</h2>
        <div className="space-y-4">
          {METRICS.map((m) => {
            const value = today[m.key];
            const goal = NUTRITION_GOALS[m.key];
            const pct = Math.min(100, (value / goal) * 100);
            return (
              <div key={m.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span style={{ color: m.color }}>{m.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(value)} / {goal} {m.unit}
                  </span>
                </div>
                <ProgressBar value={pct} color={m.color} />
              </div>
            );
          })}
        </div>
      </section>

      {today.entries.length > 0 && (
        <section className="panel p-6">
          <h2 className="mb-3 text-sm font-semibold">Записи сегодня</h2>
          <ul className="divide-y divide-border">
            {today.entries
              .slice()
              .reverse()
              .map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate text-muted-foreground">{e.text}</span>
                  <span className="shrink-0 text-xs font-medium text-primary">
                    {Math.round(e.kcal)} ккал
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
