import { useState } from "react";
import { ProgressBar } from "@/components/ProgressBar";
import { STAT_META, type GameState, type Macro } from "@/lib/game";
import {
  addNutritionEntry,
  cheatMealsRemaining,
  consumeCheatMeal,
  defaultAmountFor,
  effectiveGoals,
  getTodayNutrition,
  looksLikeMultipleProducts,
  MONTHLY_CHEAT_LIMIT,
  PORTION_UNIT_LABELS,
  PORTION_UNITS,
  portionMultiplier,
  scaledMacro,
  searchProducts,
  suggestedUnitFor,
  sumMacros,
  type MealDraftItem,
  type PortionUnit,
  type ProductCandidate,
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

/** Which sub-screen of the "add a product" flow is showing right now. */
type Phase = "search" | "quantity" | "added";

export function NutritionCalculator({ state, update }: Props) {
  const [phase, setPhase] = useState<Phase>("search");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ProductCandidate[] | null>(null);
  const [selected, setSelected] = useState<ProductCandidate | null>(null);
  const [amount, setAmount] = useState(100);
  const [unit, setUnit] = useState<PortionUnit>("g");

  const [draftItems, setDraftItems] = useState<MealDraftItem[]>([]);
  const [lastAdded, setLastAdded] = useState<string>("");
  const [saved, setSaved] = useState(false);

  const today = getTodayNutrition(state);
  const goals = effectiveGoals(state);
  const remaining = cheatMealsRemaining(state);

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setCandidates(null);
    setSaved(false);
    try {
      // Product-name-only search — Open Food Facts first, local FOOD_DB
      // fallback per product, same sources as before, just no quantity
      // parsing anymore (that's the separate step below).
      const result = await searchProducts(trimmed);
      setCandidates(result);
    } finally {
      setSearching(false);
    }
  }

  function pickCandidate(candidate: ProductCandidate) {
    const initialUnit = suggestedUnitFor(candidate.label);
    setSelected(candidate);
    setUnit(initialUnit);
    setAmount(defaultAmountFor(initialUnit));
    setPhase("quantity");
  }

  function backToSearch() {
    setSelected(null);
    setPhase("search");
  }

  function addToDraft() {
    if (!selected) return;
    const item: MealDraftItem = {
      label: selected.label,
      source: selected.source,
      base: selected.base,
      amount,
      unit,
    };
    setDraftItems((prev) => [...prev, item]);
    setLastAdded(selected.label);
    setSelected(null);
    setQuery("");
    setCandidates(null);
    setPhase("added");
  }

  function startAnotherProduct() {
    setPhase("search");
  }

  function updateDraftItem(index: number, patch: Partial<Pick<MealDraftItem, "amount" | "unit">>) {
    setDraftItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeDraftItem(index: number) {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  }

  const scaledDraftItems = draftItems.map((it) => ({ label: it.label, ...scaledMacro(it) }));
  const draftTotals: Macro = sumMacros(scaledDraftItems);

  function handleSaveMeal() {
    if (draftItems.length === 0) return;
    update((s) => addNutritionEntry(s, draftItems));
    setDraftItems([]);
    setSaved(true);
    setPhase("search");
    setQuery("");
    setCandidates(null);
    setSelected(null);
  }

  const previewMacro = selected ? scaledMacro({ base: selected.base, amount, unit }) : null;

  return (
    <div className="space-y-5">
      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Что ты съел?</h2>

        {phase === "search" && (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              Ищи по одному продукту за раз — без веса, вес уточним на следующем шаге. Нашёл один,
              добавил в приём пищи — и ищешь следующий кнопкой «Добавить ещё продукт». Смотрим в
              Open Food Facts, при отсутствии сети или совпадений — в локальной базе.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Например: куриная грудка"
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={!query.trim() || searching}
                className="shrink-0 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {searching ? "Ищем…" : "Найти"}
              </button>
            </div>

            {looksLikeMultipleProducts(query) && (
              <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                💡 Похоже, тут два продукта — попробуй найти их по одному.
              </p>
            )}

            {candidates && candidates.length === 0 && (
              <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                Ничего не найдено ни в Open Food Facts, ни в локальной базе — попробуй другое
                название.
              </p>
            )}

            {candidates && candidates.length > 0 && (
              <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                {candidates.map((c, i) => (
                  <li key={c.code ?? `${c.source}-${c.label}-${i}`}>
                    <button
                      type="button"
                      onClick={() => pickCandidate(c)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:border-primary hover:bg-secondary"
                    >
                      <span className="min-w-0 flex-1 truncate text-foreground">{c.label}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {Math.round(c.base.kcal)} ккал
                      </span>
                      <span className="shrink-0 text-[10px] uppercase text-muted-foreground/70">
                        {c.source === "online" ? "OFF" : "локальная"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {phase === "quantity" && selected && previewMacro && (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground">
              <span className="text-foreground">{selected.label}</span> — сколько ты съел?
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-28 rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as PortionUnit)}
                className="rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {PORTION_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {PORTION_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs">
              <span className="font-medium text-foreground">
                Итого: {Math.round(previewMacro.kcal)} ккал
              </span>
              {" · "}Белки {Math.round(previewMacro.protein * 10) / 10} · Жиры{" "}
              {Math.round(previewMacro.fat * 10) / 10} · Углеводы{" "}
              {Math.round(previewMacro.carbs * 10) / 10}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={backToSearch}
                className="flex-1 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                Назад
              </button>
              <button
                type="button"
                onClick={addToDraft}
                disabled={portionMultiplier(amount, unit) <= 0}
                className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Добавить в приём пищи
              </button>
            </div>
          </div>
        )}

        {phase === "added" && (
          <div className="mt-3">
            <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
              ✅ Добавлено: <span className="text-foreground">{lastAdded}</span>
            </p>
            <button
              type="button"
              onClick={startAnotherProduct}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              + Добавить ещё продукт
            </button>
          </div>
        )}

        {draftItems.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground">
              Текущий приём пищи
            </h3>
            <ul className="mt-2 space-y-2">
              {draftItems.map((it, i) => {
                const macro = scaledMacro(it);
                return (
                  <li
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">{it.label}</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={it.amount}
                      onChange={(e) => updateDraftItem(i, { amount: Number(e.target.value) || 0 })}
                      className="w-16 rounded-lg border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary"
                    />
                    <select
                      value={it.unit}
                      onChange={(e) => updateDraftItem(i, { unit: e.target.value as PortionUnit })}
                      className="rounded-lg border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary"
                    >
                      {PORTION_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {PORTION_UNIT_LABELS[u]}
                        </option>
                      ))}
                    </select>
                    <span className="shrink-0 text-muted-foreground">
                      {Math.round(macro.kcal)} ккал
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDraftItem(i)}
                      aria-label="Удалить позицию"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      Удалить
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs">
              <span className="font-medium text-foreground">
                Итого приёма пищи: {Math.round(draftTotals.kcal)} ккал
              </span>
              {" · "}Белки {Math.round(draftTotals.protein)} · Жиры {Math.round(draftTotals.fat)} ·
              Углеводы {Math.round(draftTotals.carbs)}
            </div>

            <button
              type="button"
              onClick={handleSaveMeal}
              className="mt-3 w-full rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5"
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
