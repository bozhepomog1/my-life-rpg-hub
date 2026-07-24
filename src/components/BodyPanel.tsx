import { useState } from "react";
import {
  computeFitnessIndex,
  fitnessLevelLabel,
  RECORD_META,
  type BodyStats,
  type GameState,
  type RecordKey,
} from "@/lib/game";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}

const RECORD_KEYS = Object.keys(RECORD_META) as RecordKey[];

export function BodyPanel({ state, update }: Props) {
  const body = state.body;
  const fitnessIndex = computeFitnessIndex(body);
  const [heightDraft, setHeightDraft] = useState(String(body.heightCm ?? ""));
  const [weightDraft, setWeightDraft] = useState(String(body.weightKg ?? ""));
  const [recordDrafts, setRecordDrafts] = useState<Record<RecordKey, string>>(() =>
    RECORD_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: body[k] != null ? String(body[k]) : "" }),
      {} as Record<RecordKey, string>,
    ),
  );
  const [celebrating, setCelebrating] = useState<RecordKey | null>(null);

  function saveMeasurement(field: "heightCm" | "weightKg", draft: string) {
    const n = Math.max(0, Math.round(Number(draft) || 0));
    if (!n) return;
    update((s) => ({ ...s, body: { ...s.body, [field]: n } }));
  }

  function saveRecord(key: RecordKey) {
    const n = Math.max(0, Math.round(Number(recordDrafts[key]) || 0));
    if (!n) return;
    const prev = body[key];
    update((s) => ({ ...s, body: { ...s.body, [key]: n } }));
    setRecordDrafts((d) => ({ ...d, [key]: String(n) }));
    if (prev != null && n > prev) {
      setCelebrating(key);
      setTimeout(() => setCelebrating((c) => (c === key ? null : c)), 1800);
    }
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
            <div className="mt-1 flex gap-2">
              <input
                type="number"
                min={0}
                value={heightDraft}
                onChange={(e) => setHeightDraft(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => saveMeasurement("heightCm", heightDraft)}
                disabled={!heightDraft.trim() || Number(heightDraft) === body.heightCm}
                className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Сохранить
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Вес (кг)</label>
            <div className="mt-1 flex gap-2">
              <input
                type="number"
                min={0}
                value={weightDraft}
                onChange={(e) => setWeightDraft(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => saveMeasurement("weightKg", weightDraft)}
                disabled={!weightDraft.trim() || Number(weightDraft) === body.weightKg}
                className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Мои рекорды</h2>
        <div className="mt-3 space-y-4">
          {RECORD_KEYS.map((key) => (
            <RecordField
              key={key}
              recordKey={key}
              body={body}
              draft={recordDrafts[key]}
              onDraftChange={(v) => setRecordDrafts((d) => ({ ...d, [key]: v }))}
              onSave={() => saveRecord(key)}
              celebrating={celebrating === key}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function RecordField({
  recordKey,
  body,
  draft,
  onDraftChange,
  onSave,
  celebrating,
}: {
  recordKey: RecordKey;
  body: BodyStats;
  draft: string;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  celebrating: boolean;
}) {
  const meta = RECORD_META[recordKey];
  const current = body[recordKey];
  const changed = draft.trim() !== "" && Number(draft) !== current;

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">{meta.label}</label>
        {celebrating && (
          <span className="animate-level-up rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            🏆 Новый рекорд!
          </span>
        )}
      </div>
      <div className="mt-1 flex gap-2">
        <input
          type="number"
          min={0}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={meta.unit}
          className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={!changed}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}
