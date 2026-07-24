import { useState } from "react";
import {
  computeFitnessIndex,
  fitnessLevelLabel,
  RECORD_META,
  type GameState,
  type RecordKey,
} from "@/lib/game";
import { AutosaveField } from "@/components/AutosaveField";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}

const RECORD_KEYS = Object.keys(RECORD_META) as RecordKey[];

export function BodyPanel({ state, update }: Props) {
  const body = state.body;
  const fitnessIndex = computeFitnessIndex(body);
  const [celebrating, setCelebrating] = useState<RecordKey | null>(null);

  /** Returns true if the value actually changed and was saved. */
  function commitMeasurement(field: "heightCm" | "weightKg", raw: string): boolean {
    if (raw.trim() === "") return false;
    const n = Math.max(0, Math.round(Number(raw) || 0));
    if (!n || n === body[field]) return false;
    update((s) => ({ ...s, body: { ...s.body, [field]: n } }));
    return true;
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
          </>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Параметры тела</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </div>
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
