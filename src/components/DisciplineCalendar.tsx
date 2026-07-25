import { useState } from "react";
import { createPortal } from "react-dom";
import {
  computeDiscipline,
  setManualDayOverride,
  todayKey,
  type DayStatus,
  type GameState,
} from "@/lib/game";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}

export function DisciplineCalendar({ state, update }: Props) {
  const { days } = computeDiscipline(state);
  const [editing, setEditing] = useState<DayStatus | null>(null);
  const todayK = todayKey();

  function apply(status: "green" | "red" | null) {
    if (!editing) return;
    update((s) => setManualDayOverride(s, editing.date, status));
    setEditing(null);
  }

  return (
    <div className="panel p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Календарь дисциплины</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Dot c="var(--color-success)" /> закрыт
          </span>
          <span className="flex items-center gap-1">
            <Dot c="var(--color-destructive)" /> пропуск
          </span>
          <span className="flex items-center gap-1">
            <Dot c="var(--color-primary)" /> сегодня
          </span>
        </div>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Забыл(а) залогировать день? Нажми на прошедший день, чтобы поправить его вручную —
        сегодняшний и будущие дни не редактируются, они считаются автоматически.
      </p>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {days.map((d, i) => {
          const cfg = STYLE[d.status];
          // Only strictly-past days are editable — matches the hard guard in
          // setManualDayOverride(), so this is a UX convenience, not the only
          // thing standing between the user and editing "today".
          const editable = d.date < todayK;
          return (
            <button
              key={d.date}
              type="button"
              title={editable ? `${d.date} — нажми, чтобы поправить` : d.date}
              disabled={!editable}
              onClick={() => editable && setEditing(d)}
              className={`relative aspect-square grid place-items-center rounded-lg border text-xs ${
                editable ? "cursor-pointer transition-transform hover:scale-110" : "cursor-default"
              }`}
              style={{ borderColor: cfg.border, background: cfg.bg, color: cfg.color }}
            >
              <span className="absolute left-1 top-0.5 text-[10px] text-muted-foreground">
                {i + 1}
              </span>
              <span className="text-sm">{cfg.icon}</span>
            </button>
          );
        })}
      </div>

      {editing &&
        typeof document !== "undefined" &&
        createPortal(
          <DayEditModal
            day={editing}
            hasOverride={!!state.manualDayOverrides[editing.date]}
            onApply={apply}
            onCancel={() => setEditing(null)}
          />,
          document.body,
        )}
    </div>
  );
}

function DayEditModal({
  day,
  hasOverride,
  onApply,
  onCancel,
}: {
  day: DayStatus;
  hasOverride: boolean;
  onApply: (status: "green" | "red" | null) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="panel-glow w-full max-w-xs p-6 text-center"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Редактировать день"
      >
        <h3 className="text-sm font-semibold">Отметить {day.date}</h3>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Только для прошедших дней — сегодняшний день считается автоматически по фактически
          выполненным квестам.
        </p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => onApply("green")}
            className="rounded-xl border border-success/40 bg-success/10 px-4 py-2 text-sm font-medium text-success transition-colors hover:bg-success/20"
          >
            ✓ Закрыт (выполнено)
          </button>
          <button
            type="button"
            onClick={() => onApply("red")}
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
          >
            ✕ Пропуск
          </button>
          {hasOverride && (
            <button
              type="button"
              onClick={() => onApply(null)}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
            >
              Сбросить к автоматическому
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />;
}

const STYLE: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  green: {
    bg: "color-mix(in srgb, var(--color-success) 14%, transparent)",
    border: "color-mix(in srgb, var(--color-success) 45%, transparent)",
    color: "var(--color-success)",
    icon: "✓",
  },
  red: {
    bg: "color-mix(in srgb, var(--color-destructive) 12%, transparent)",
    border: "color-mix(in srgb, var(--color-destructive) 40%, transparent)",
    color: "var(--color-destructive)",
    icon: "✕",
  },
  pending: {
    bg: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
    border: "color-mix(in srgb, var(--color-primary) 40%, transparent)",
    color: "var(--color-primary)",
    icon: "●",
  },
  future: {
    bg: "var(--color-muted)",
    border: "var(--color-border)",
    color: "var(--color-muted-foreground)",
    icon: "·",
  },
};
