import { useMemo, useState } from "react";
import { ProgressBar } from "@/components/ProgressBar";
import { STAT_META, type GameState, type Macro } from "@/lib/game";
import {
  addNutritionEntry,
  cheatMealsRemaining,
  effectiveGoals,
  getTodayNutrition,
  consumeCheatMeal,
  MONTHLY_CHEAT_LIMIT,
  resolveChoice,
  resolveMealOnline,
  type OnlineMealItem,
  type SegmentResolution,
} from "@/lib/nutrition";
import type { OffProduct } from "@/lib/openfoodfacts";

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
  const [searching, setSearching] = useState(false);
  const [resolutions, setResolutions] = useState<SegmentResolution[] | null>(null);
  const [savedText, setSavedText] = useState("");
  // User's pick for a "choose" segment (several Open Food Facts matches —
  // see resolveMealOnline), keyed by that segment's index in `resolutions`.
  const [choices, setChoices] = useState<Record<number, OffProduct>>({});
  const [saved, setSaved] = useState(false);

  const today = getTodayNutrition(state);
  const goals = effectiveGoals(state);
  const remaining = cheatMealsRemaining(state);

  async function handleSearch() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSearching(true);
    setResolutions(null);
    setChoices({});
    setSaved(false);
    setSavedText(trimmed);
    try {
      // Looks each comma-separated dish up on Open Food Facts first (a
      // free, key-less public product search — supports Russian), and
      // only falls back to the local keyword database (nutrition.ts'
      // FOOD_DB) per-dish if OFF has no match or is unreachable.
      const result = await resolveMealOnline(trimmed);
      setResolutions(result);
    } finally {
      setSearching(false);
    }
  }

  const pendingChoiceCount = useMemo(
    () => (resolutions ?? []).filter((r, i) => r.kind === "choose" && !choices[i]).length,
    [resolutions, choices],
  );

  // Every segment's final item: "resolved" as-is, "choose" once the user
  // has picked one of the candidates, "not-found" segments are simply left
  // out of the total (shown separately below instead).
  const finalItems: OnlineMealItem[] = useMemo(() => {
    if (!resolutions) return [];
    const out: OnlineMealItem[] = [];
    resolutions.forEach((r, i) => {
      if (r.kind === "resolved") out.push(r.item);
      else if (r.kind === "choose" && choices[i]) out.push(resolveChoice(choices[i], r.qty));
    });
    return out;
  }, [resolutions, choices]);

  const finalTotals: Macro = useMemo(
    () =>
      finalItems.reduce<Macro>(
        (acc, it) => ({
          kcal: acc.kcal + it.kcal,
          protein: acc.protein + it.protein,
          fat: acc.fat + it.fat,
          carbs: acc.carbs + it.carbs,
        }),
        { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      ),
    [finalItems],
  );

  const notFoundSegments = (resolutions ?? [])
    .filter((r) => r.kind === "not-found")
    .map((r) => r.segment);

  function handleSave() {
    if (finalItems.length === 0) return;
    update((s) => addNutritionEntry(s, savedText, finalTotals));
    setSaved(true);
    setText("");
    setResolutions(null);
    setChoices({});
  }

  return (
    <div className="space-y-5">
      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Что ты съел?</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Опиши простыми словами, например: 2 яйца, тост, кофе с молоком — сначала ищем в базе Open
          Food Facts, при отсутствии сети или совпадений подключается локальная база.
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
          onClick={handleSearch}
          disabled={!text.trim() || searching}
          className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {searching ? "Ищем…" : "Найти"}
        </button>

        {resolutions && resolutions.length === 0 && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Ничего не введено для поиска.
          </p>
        )}

        {resolutions && resolutions.length > 0 && (
          <div className="mt-3 space-y-3">
            {resolutions.map((r, i) => {
              if (r.kind === "resolved") {
                return (
                  <div
                    key={i}
                    className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground"
                  >
                    <span className="text-foreground">{r.item.label}</span>
                    {r.item.qty !== 1 ? ` × ${Math.round(r.item.qty * 10) / 10}` : ""} —{" "}
                    {Math.round(r.item.kcal)} ккал
                    <span className="ml-1.5 text-[10px] uppercase text-muted-foreground/70">
                      {r.item.source === "online" ? "Open Food Facts" : "локальная база"}
                    </span>
                  </div>
                );
              }
              if (r.kind === "choose") {
                const picked = choices[i];
                return (
                  <div key={i} className="rounded-lg border border-border px-3 py-2">
                    <div className="text-xs font-medium text-foreground">
                      «{r.segment}» — несколько совпадений, выбери нужное:
                    </div>
                    <ul className="mt-2 space-y-1">
                      {r.candidates.map((c) => (
                        <li key={c.code}>
                          <label className="flex cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="radio"
                              name={`choice-${i}`}
                              checked={picked?.code === c.code}
                              onChange={() => setChoices((prev) => ({ ...prev, [i]: c }))}
                              className="accent-primary"
                            />
                            <span className="min-w-0 flex-1 truncate">{c.label}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {Math.round(c.kcal)} ккал/100г
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }
              return (
                <p key={i} className="text-xs text-muted-foreground">
                  «{r.segment}» — не распознано ни в Open Food Facts, ни в локальной базе.
                </p>
              );
            })}

            {pendingChoiceCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Выбери вариант для {pendingChoiceCount === 1 ? "позиции" : "позиций"} выше, чтобы
                посчитать итог.
              </p>
            )}

            {finalItems.length > 0 && (
              <div className="rounded-lg bg-secondary px-3 py-2 text-xs">
                <div className="font-medium text-foreground">
                  Итого: {Math.round(finalTotals.kcal)} ккал · Белки{" "}
                  {Math.round(finalTotals.protein)} · Жиры {Math.round(finalTotals.fat)} · Углеводы{" "}
                  {Math.round(finalTotals.carbs)}
                </div>
              </div>
            )}

            {notFoundSegments.length > 0 && finalItems.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Не учтено в итоге: {notFoundSegments.join(", ")}
              </p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={finalItems.length === 0 || pendingChoiceCount > 0}
              className="w-full rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Сохранить в дневник
            </button>
          </div>
        )}

        {saved && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Записано ✅
          </p>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Лимит поощрений на месяц</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Осознанный читмил вместо штрафа: снижает цель по углеводам/жирам на остаток дня, но день
          всё равно остаётся зелёным в календаре — это выбор, а не провал.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">
            {remaining} / {MONTHLY_CHEAT_LIMIT} разрешённых
          </span>
          <button
            type="button"
            onClick={() => update((s) => consumeCheatMeal(s))}
            disabled={remaining <= 0}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Использовать поощрение
          </button>
        </div>
        {remaining <= 0 && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Лимит на этот месяц исчерпан — новые поощрения появятся в следующем месяце.
          </p>
        )}
        {today.cheatMealUsed && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Сегодня цель по углеводам/жирам временно снижена — день всё равно засчитан ✅
          </p>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="mb-4 text-sm font-semibold">Прогресс дня</h2>
        <div className="space-y-4">
          {METRICS.map((m) => {
            const value = today[m.key];
            const goal = goals[m.key];
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
