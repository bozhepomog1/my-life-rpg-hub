import { useRef, useState } from "react";
import { ProgressBar } from "@/components/ProgressBar";
import { FeedbackToast } from "@/components/FeedbackToast";
import {
  NUTRITION_FEEDBACK_MESSAGES,
  pickFeedbackMessage,
  STAT_META,
  type GameState,
  type Macro,
} from "@/lib/game";
import {
  addNutritionEntry,
  baseGoals,
  cheatMealsRemaining,
  computeNutritionStreak,
  consumeCheatMeal,
  defaultAmountFor,
  effectiveGoals,
  getTodayNutrition,
  looksLikeMultipleProducts,
  MONTHLY_CHEAT_LIMIT,
  PORTION_UNIT_LABELS,
  PORTION_UNITS,
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

export function NutritionCalculator({ state, update }: Props) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ProductCandidate[] | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [draftItems, setDraftItems] = useState<MealDraftItem[]>([]);
  // Brief inline confirmation after an instant-add — cleared by the next
  // search/add so it never goes stale on screen.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<{ id: number; message: string; detail?: string } | null>(
    null,
  );
  const feedbackId = useRef(0);

  const today = getTodayNutrition(state);
  const base = baseGoals(state);
  const goals = effectiveGoals(state);
  const remaining = cheatMealsRemaining(state);

  function handleUseCheatMeal() {
    const captured = { before: base, after: goals };
    update((s) => {
      captured.before = baseGoals(s);
      const next = consumeCheatMeal(s);
      captured.after = effectiveGoals(next);
      return next;
    });
    const carbsDelta = captured.before.carbs - captured.after.carbs;
    const fatDelta = captured.before.fat - captured.after.fat;
    if (carbsDelta <= 0 && fatDelta <= 0) return;
    setFeedback({
      id: ++feedbackId.current,
      message: "Поощрение использовано",
      detail: `Цель по углеводам на сегодня снижена на ${carbsDelta} г (${captured.before.carbs} → ${captured.after.carbs}), по жирам — на ${fatDelta} г (${captured.before.fat} → ${captured.after.fat}). День всё равно останется зелёным в календаре.`,
    });
  }

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setCandidates(null);
    setSaved(false);
    setJustAdded(null);
    try {
      // Product-name-only search — Open Food Facts first, local FOOD_DB
      // fallback per product, same sources as before.
      const result = await searchProducts(trimmed);
      setCandidates(result);
    } finally {
      setSearching(false);
    }
  }

  /**
   * Instantly adds a candidate to the draft at a sensible default amount
   * (100 г/мл for weight/volume products, 1 шт/порция for counted ones —
   * see suggestedUnitFor/defaultAmountFor), then clears the search so the
   * next product can be searched right away. Replaces the old three-step
   * "pick → set exact quantity on its own screen → confirm added → tap
   * 'add another'" cycle, which meant a full extra screen and click per
   * product when adding a multi-component meal. The exact weight is still
   * fully editable afterward, inline, in the "Текущий приём пищи" list
   * below — so nothing about precision is lost, just reordered: add first,
   * fine-tune the grams after, instead of fine-tuning before every add.
   */
  function addCandidate(candidate: ProductCandidate) {
    const unit = suggestedUnitFor(candidate.label);
    const item: MealDraftItem = {
      label: candidate.label,
      source: candidate.source,
      base: candidate.base,
      amount: defaultAmountFor(unit),
      unit,
    };
    setDraftItems((prev) => [...prev, item]);
    setJustAdded(candidate.label);
    setQuery("");
    setCandidates(null);
    searchInputRef.current?.focus();
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
    // Captured via a mutable holder (not a reassigned `let`) inside the
    // updater, since it must reflect the state AFTER this save (today's
    // running total, and any streak day that just became "complete") — the
    // updater runs synchronously the moment update() is called, so this is
    // safe to read right after.
    const captured: { feedback: { message: string; detail?: string } | null } = { feedback: null };
    update((s) => {
      const next = addNutritionEntry(s, draftItems);
      const goalKcal = effectiveGoals(next).kcal;
      const todayTotal = getTodayNutrition(next).kcal;
      // Only celebrate staying WITHIN goal — going over isn't something to
      // reinforce with a motivating message.
      if (todayTotal > 0 && todayTotal <= goalKcal) {
        const streak = computeNutritionStreak(next);
        captured.feedback = {
          message: pickFeedbackMessage(NUTRITION_FEEDBACK_MESSAGES),
          // Real, not invented — an actual count of consecutive days within goal.
          detail:
            streak > 1
              ? `Это уже ${streak}-й день подряд, когда ты в пределах своей цели по калориям.`
              : undefined,
        };
      }
      return next;
    });
    if (captured.feedback) {
      setFeedback({
        id: ++feedbackId.current,
        message: captured.feedback.message,
        detail: captured.feedback.detail,
      });
    }
    setDraftItems([]);
    setSaved(true);
    setJustAdded(null);
    setQuery("");
    setCandidates(null);
  }

  return (
    <div className="space-y-5">
      {feedback && (
        <FeedbackToast
          key={feedback.id}
          message={feedback.message}
          detail={feedback.detail}
          icon="🥗"
          onDismiss={() => setFeedback(null)}
        />
      )}

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Что ты съел?</h2>

        <p className="mt-1 text-xs text-muted-foreground">
          Нажми на нужный продукт — он сразу добавится в приём пищи с обычным весом (100 г/мл или 1
          шт/порция), а точный вес поправишь ниже в списке. Смотрим в Open Food Facts, при
          отсутствии сети или совпадений — в локальной базе.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            ref={searchInputRef}
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
            💡 Похоже, тут два продукта — попробуй найти их по одному, каждый добавится отдельной
            строкой.
          </p>
        )}

        {justAdded && (
          <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            ✅ Добавлено: <span className="text-foreground">{justAdded}</span> — ищи следующий
            продукт или поправь вес в списке ниже.
          </p>
        )}

        {candidates && candidates.length === 0 && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Ничего не найдено ни в Open Food Facts, ни в локальной базе — попробуй другое название.
          </p>
        )}

        {candidates && candidates.length > 0 && (
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
            {candidates.map((c, i) => (
              <li key={c.code ?? `${c.source}-${c.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => addCandidate(c)}
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
            onClick={handleUseCheatMeal}
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
            Поощрение использовано: цель по углеводам сегодня снижена на {base.carbs - goals.carbs}{" "}
            г ({base.carbs} → {goals.carbs}), по жирам — на {base.fat - goals.fat} г ({base.fat} →{" "}
            {goals.fat}). День всё равно засчитан ✅
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
