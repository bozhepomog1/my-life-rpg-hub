import { useState } from "react";
import {
  computeFitnessIndex,
  computeNutritionGoals,
  fitnessLevelLabel,
  NUTRITION_GOAL_LABELS,
  RECORD_META,
  type GameState,
  type Macro,
  type NutritionGoal,
  type RecordKey,
  type Sex,
} from "@/lib/game";
import { AutosaveField } from "@/components/AutosaveField";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}

const RECORD_KEYS = Object.keys(RECORD_META) as RecordKey[];
const GOALS = Object.keys(NUTRITION_GOAL_LABELS) as NutritionGoal[];
const MACRO_FIELDS: { key: keyof Macro; label: string }[] = [
  { key: "kcal", label: "Ккал" },
  { key: "protein", label: "Белки (г)" },
  { key: "fat", label: "Жиры (г)" },
  { key: "carbs", label: "Углеводы (г)" },
];

export function BodyPanel({ state, update }: Props) {
  const body = state.body;
  const fitnessIndex = computeFitnessIndex(body);
  const [celebrating, setCelebrating] = useState<RecordKey | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(!!body.nutritionOverride);

  const calculatedGoals = computeNutritionGoals(body);
  const effectiveGoals = body.nutritionOverride ?? calculatedGoals;

  /** Returns true if the value actually changed and was saved. */
  function commitMeasurement(field: "heightCm" | "weightKg" | "age", raw: string): boolean {
    if (raw.trim() === "") return false;
    const n = Math.max(0, Math.round(Number(raw) || 0));
    if (!n || n === body[field]) return false;
    update((s) => ({ ...s, body: { ...s.body, [field]: n } }));
    return true;
  }

  function setSex(sex: Sex) {
    update((s) => ({ ...s, body: { ...s.body, sex } }));
  }

  function setGoal(goal: NutritionGoal) {
    update((s) => ({ ...s, body: { ...s.body, goal } }));
  }

  function commitOverrideField(key: keyof Macro, raw: string): boolean {
    if (raw.trim() === "") return false;
    const n = Math.max(0, Math.round(Number(raw) || 0));
    const base: Macro = body.nutritionOverride ??
      calculatedGoals ?? { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    if (n === base[key]) return false;
    update((s) => ({
      ...s,
      body: { ...s.body, nutritionOverride: { ...base, [key]: n } },
    }));
    return true;
  }

  function clearOverride() {
    update((s) => ({ ...s, body: { ...s.body, nutritionOverride: undefined } }));
    setOverrideOpen(false);
  }

  function commitRecord(key: RecordKey, raw: string): boolean {
    if (raw.trim() === "") return false;
    const n = Math.max(0, Math.round(Number(raw) || 0));
    if (!n || n === body[key]) return false;
    const prev = body[key];
    update((s) => ({ ...s, body: { ...s.body, [key]: n } }));
    if (prev != null && n > prev) {
      setCelebrating(key);
      setTimeout(() => setCelebrating((c) => (c === key ? null : c)), 1800);
    }
    return true;
  }

  return (
    <div className="space-y-5">
      <section className="panel-glow p-6 text-center">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
          Индекс физической формы
        </h2>
        {fitnessIndex == null ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Заполни свои рекорды, чтобы увидеть индекс
          </p>
        ) : (
          <>
            <div className="mt-2 text-5xl font-semibold text-primary">{fitnessIndex}</div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {fitnessLevelLabel(fitnessIndex)}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Считается по среднему из твоих 4 рекордов относительно продвинутого уровня
            </p>
          </>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Параметры тела</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Рост (см)</label>
            <div className="mt-1">
              <AutosaveField
                type="number"
                min={0}
                ariaLabel="Рост в сантиметрах"
                value={String(body.heightCm ?? "")}
                onCommit={(raw) => commitMeasurement("heightCm", raw)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Вес (кг)</label>
            <div className="mt-1">
              <AutosaveField
                type="number"
                min={0}
                ariaLabel="Вес в килограммах"
                value={String(body.weightKg ?? "")}
                onCommit={(raw) => commitMeasurement("weightKg", raw)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Возраст</label>
            <div className="mt-1">
              <AutosaveField
                type="number"
                min={0}
                ariaLabel="Возраст"
                value={String(body.age ?? "")}
                onCommit={(raw) => commitMeasurement("age", raw)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Цель по питанию</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          На основе роста, веса, возраста, пола и цели рассчитаем рекомендуемые Ккал и БЖУ по
          формуле Mífflin-St Jeor — они автоматически станут целями во вкладке «Питание».
        </p>

        <div className="mt-3">
          <label className="text-xs text-muted-foreground">Пол</label>
          <div className="mt-1 flex gap-1.5">
            {(["male", "female"] as Sex[]).map((sex) => (
              <button
                key={sex}
                type="button"
                onClick={() => setSex(sex)}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                  body.sex === sex
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {sex === "male" ? "Мужской" : "Женский"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs text-muted-foreground">Цель</label>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {GOALS.map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => setGoal(goal)}
                className={`rounded-xl px-2 py-2 text-xs font-medium transition-colors ${
                  body.goal === goal
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {NUTRITION_GOAL_LABELS[goal]}
              </button>
            ))}
          </div>
        </div>

        {!calculatedGoals ? (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Заполни рост, вес, возраст, пол и цель выше, чтобы увидеть расчёт.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {MACRO_FIELDS.map((f) => (
              <div key={f.key} className="rounded-lg bg-secondary px-1.5 py-2">
                <div className="text-sm font-semibold text-foreground">
                  {effectiveGoals?.[f.key]}
                </div>
                <div className="text-[10px] text-muted-foreground">{f.label}</div>
              </div>
            ))}
          </div>
        )}

        {calculatedGoals && (
          <div className="mt-3">
            {!overrideOpen && !body.nutritionOverride && (
              <button
                type="button"
                onClick={() => setOverrideOpen(true)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Не согласен с расчётом? Переопределить вручную
              </button>
            )}
            {(overrideOpen || body.nutritionOverride) && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Свои значения целей (используются вместо расчёта):
                  </p>
                  {body.nutritionOverride && (
                    <button
                      type="button"
                      onClick={clearOverride}
                      className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                    >
                      Сбросить к расчёту
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MACRO_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="text-[10px] text-muted-foreground">{f.label}</label>
                      <div className="mt-0.5">
                        <AutosaveField
                          type="number"
                          min={0}
                          ariaLabel={f.label}
                          value={String((body.nutritionOverride ?? calculatedGoals)[f.key])}
                          onCommit={(raw) => commitOverrideField(f.key, raw)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Мои рекорды</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Сохраняются автоматически, кнопка не нужна.
        </p>
        <div className="mt-3 space-y-4">
          {RECORD_KEYS.map((key) => {
            const meta = RECORD_META[key];
            return (
              <div key={key}>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">{meta.label}</label>
                  {celebrating === key && (
                    <span className="animate-level-up rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                      🏆 Новый рекорд!
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  <AutosaveField
                    type="number"
                    min={0}
                    ariaLabel={meta.label}
                    placeholder={meta.unit}
                    value={String(body[key] ?? "")}
                    onCommit={(raw) => commitRecord(key, raw)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
