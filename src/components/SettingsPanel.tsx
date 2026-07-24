import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { defaultState, todayKey, type GameState } from "@/lib/game";
import { REMINDER_HOUR } from "@/lib/reminders";
import { AutosaveField } from "@/components/AutosaveField";

type NotificationPermissionState = NotificationPermission | "unsupported";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  setState: (s: GameState) => void;
}

export function SettingsPanel({ state, update, setState }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>("unsupported");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  async function handleEnableReminders() {
    if (permission === "unsupported") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") update((s) => ({ ...s, remindersEnabled: true }));
  }

  function handleToggleReminders() {
    update((s) => ({ ...s, remindersEnabled: !s.remindersEnabled }));
  }

  function commitName(raw: string): boolean {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === state.name) return false;
    update((s) => ({ ...s, name: trimmed }));
    return true;
  }

  function commitDeposit(raw: string): boolean {
    if (raw.trim() === "") return false;
    const n = Math.max(0, Math.round(Number(raw) || 0));
    if (n === state.depositAmount) return false;
    update((s) => ({ ...s, depositAmount: n }));
    return true;
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `life-rpg-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function resetAll() {
    setState(defaultState());
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-5">
      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Имя персонажа</h2>
        <div className="mt-3">
          <AutosaveField
            value={state.name}
            placeholder="Герой"
            ariaLabel="Имя персонажа"
            onCommit={commitName}
          />
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Залог</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Текущая сумма: <span className="font-medium text-foreground">${state.depositAmount}</span>
        </p>
        <div className="mt-3">
          <AutosaveField
            type="number"
            min={0}
            value={String(state.depositAmount)}
            ariaLabel="Сумма залога"
            onCommit={commitDeposit}
          />
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Напоминания</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Если к {REMINDER_HOUR}:00 по твоему времени ещё остались незакрытые ежедневные квесты,
          пришлём уведомление в браузере. Работает, только пока эта вкладка открыта — при закрытой
          вкладке или браузере уведомление не придёт, это ограничение самой технологии, не наше.
        </p>

        {permission === "unsupported" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Этот браузер не поддерживает уведомления.
          </p>
        )}

        {permission === "denied" && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Уведомления заблокированы в настройках браузера. Разреши их вручную для этого сайта,
            чтобы включить напоминания.
          </p>
        )}

        {permission === "default" && (
          <button
            type="button"
            onClick={handleEnableReminders}
            className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5"
          >
            Включить напоминания
          </button>
        )}

        {permission === "granted" && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {state.remindersEnabled ? "Включены" : "Выключены"}
            </span>
            <button
              type="button"
              onClick={handleToggleReminders}
              className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-secondary"
            >
              {state.remindersEnabled ? "Выключить" : "Включить"}
            </button>
          </div>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Данные</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Экспортирует весь твой прогресс (квесты, статы, залог, питание) в один JSON-файл.
        </p>
        <button
          type="button"
          onClick={exportBackup}
          className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-secondary"
        >
          Скачать резервную копию данных (JSON)
        </button>
      </section>

      <section className="panel border-destructive/30 p-6">
        <h2 className="text-sm font-semibold text-destructive">Опасная зона</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Полностью сбрасывает уровень, статы, квесты, залог и питание к начальному состоянию.
        </p>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="mt-3 rounded-full border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-all hover:-translate-y-0.5 hover:bg-destructive/10"
        >
          Сбросить весь прогресс
        </button>
      </section>

      {confirmOpen &&
        createPortal(
          <ResetConfirmModal onCancel={() => setConfirmOpen(false)} onConfirm={resetAll} />,
          document.body,
        )}
    </div>
  );
}

function ResetConfirmModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="panel-glow w-full max-w-sm p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-destructive">Ты уверен?</h3>
        <p className="mt-2 text-sm text-muted-foreground">Это действие необратимо.</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90"
          >
            Да, сбросить
          </button>
        </div>
      </div>
    </div>
  );
}
