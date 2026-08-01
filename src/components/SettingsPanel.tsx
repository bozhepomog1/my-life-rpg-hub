import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { Bell, Gamepad2, Palette, ShieldCheck, UserCog } from "lucide-react";
import { defaultState, isWorkDay, todayKey, type GameState, type ScheduleMode } from "@/lib/game";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { AutosaveField } from "@/components/AutosaveField";
import { DepositSetupModal } from "@/components/DepositSetupModal";
import { InstallAppButton } from "@/components/InstallAppButton";
import { isValidHex } from "@/lib/color";
import { signOut } from "@/lib/auth";
import { useTheme } from "@/hooks/use-theme";
import {
  ACCENT_PRESETS,
  accentContrastWarning,
  BACKGROUND_PRESETS,
  backgroundCardSimilarityWarning,
  backgroundContrastWarning,
  CARD_COLOR_PRESETS,
  DEFAULT_BACKGROUND,
  DEFAULT_CARD_COLOR,
  findMatchingPreset,
  type AccentColors,
  type BackgroundSettings,
} from "@/lib/personalization";
import { useAuthContext } from "@/lib/use-auth-context";
import { getBackgroundPhotoUrl, uploadBackgroundPhoto } from "@/lib/background-photo";
import { useMyShortCode } from "@/hooks/use-my-short-code";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// Settings used to be one long unstructured scroll of 13 panels — grouped
// into categories below, purely a presentation change (a tab strip filters
// which existing <section> panels render; nothing about what each setting
// does or where its state lives changed). Sections that don't map cleanly
// onto Account/Appearance/Notifications/Privacy (install button, work
// schedule, deposit, sound effects — all gameplay-mechanic toggles rather
// than identity, look, alerts, or visibility) get a 5th "Игра" bucket
// instead of being forced into a category they don't really belong to.
type SettingsCategory = "account" | "appearance" | "notifications" | "privacy" | "game";

const SETTINGS_CATEGORIES: { id: SettingsCategory; label: string; icon: typeof UserCog }[] = [
  { id: "account", label: "Аккаунт и безопасность", icon: UserCog },
  { id: "appearance", label: "Оформление", icon: Palette },
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "privacy", label: "Приватность", icon: ShieldCheck },
  { id: "game", label: "Игра", icon: Gamepad2 },
];

const PUSH_ERROR_MESSAGES: Record<string, string> = {
  unsupported: "Этот браузер не поддерживает push-уведомления.",
  "no-vapid-key": "Push пока не настроен на сервере — сообщи об этом разработчику.",
  "permission-denied":
    "Уведомления заблокированы в настройках браузера. Разреши их вручную для этого сайта.",
  error: "Не удалось включить уведомления. Попробуй ещё раз.",
};

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  setState: (s: GameState) => void;
}

export function SettingsPanel({ state, update, setState }: Props) {
  const { user } = useAuthContext();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [bgUploading, setBgUploading] = useState(false);
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const { code: myCode, loading: myCodeLoading } = useMyShortCode();
  const [codeCopied, setCodeCopied] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [category, setCategory] = useState<SettingsCategory>("account");
  const { theme, setTheme } = useTheme();

  async function copyMyCode() {
    if (!myCode) return;
    try {
      await navigator.clipboard.writeText(myCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch (e) {
      console.warn("copy failed", e);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (state.background.mode !== "photo" || !state.background.photoPath) {
      setBgPreviewUrl(null);
      return;
    }
    getBackgroundPhotoUrl(state.background.photoPath).then((url) => {
      if (!cancelled) setBgPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [state.background.mode, state.background.photoPath]);

  async function handleEnableReminders() {
    if (!user) return;
    setPushBusy(true);
    setPushError(null);
    const result = await subscribeToPush(user.id);
    setPushBusy(false);
    if (result.ok) {
      update((s) => ({ ...s, remindersEnabled: true }));
    } else {
      setPushError(PUSH_ERROR_MESSAGES[result.reason] ?? PUSH_ERROR_MESSAGES.error);
    }
  }

  async function handleDisableReminders() {
    setPushBusy(true);
    await unsubscribeFromPush();
    setPushBusy(false);
    update((s) => ({ ...s, remindersEnabled: false }));
  }

  function setScheduleMode(mode: ScheduleMode) {
    update((s) => ({ ...s, schedule: { ...s.schedule, mode } }));
  }

  function toggleWeekday(index: number) {
    update((s) => {
      const weeklyWorkDays = [...s.schedule.weeklyWorkDays];
      weeklyWorkDays[index] = !weeklyWorkDays[index];
      return { ...s, schedule: { ...s.schedule, weeklyWorkDays } };
    });
  }

  function setCycleField(field: "cycleWorkDays" | "cycleRestDays", raw: string) {
    const n = Math.min(30, Math.max(1, Math.round(Number(raw) || 1)));
    update((s) => ({ ...s, schedule: { ...s.schedule, [field]: n } }));
  }

  function setCycleAnchor(raw: string) {
    if (!raw) return;
    update((s) => ({ ...s, schedule: { ...s.schedule, cycleAnchor: raw } }));
  }

  function setReminderHour(raw: string) {
    const n = Math.min(23, Math.max(0, Math.round(Number(raw))));
    if (!Number.isFinite(n)) return;
    update((s) => ({ ...s, reminderHour: n }));
  }

  function commitName(raw: string): boolean {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === state.name) return false;
    update((s) => ({ ...s, name: trimmed }));
    return true;
  }

  function confirmDepositSetup(amount: number, durationDays: number) {
    update((s) => ({
      ...s,
      depositEnabled: true,
      depositAmount: amount,
      depositDurationDays: durationDays,
      depositStartAt: Date.now(),
      depositLost: false,
    }));
    setDepositModalOpen(false);
  }

  function disableDeposit() {
    if (
      !confirm("Отключить залог? Текущий отсчёт остановится, деньги (если реальные) не сгорят.")
    ) {
      return;
    }
    update((s) => ({ ...s, depositEnabled: false }));
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

  function applyPreset(colors: AccentColors) {
    update((s) => ({ ...s, accentColors: { ...colors } }));
  }

  function setCustomColor(key: keyof AccentColors, hex: string) {
    if (!isValidHex(hex)) return;
    update((s) => ({ ...s, accentColors: { ...s.accentColors, [key]: hex } }));
  }

  function applyBackgroundPreset(color: string | null) {
    update((s) => ({
      ...s,
      background: color
        ? ({ ...s.background, mode: "color", color } as BackgroundSettings)
        : ({ ...s.background, mode: "default" } as BackgroundSettings),
    }));
  }

  function setCustomBackgroundColor(hex: string) {
    if (!isValidHex(hex)) return;
    update((s) => ({ ...s, background: { ...s.background, mode: "color", color: hex } }));
  }

  async function handleBackgroundFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setBgUploading(true);
    try {
      const path = await uploadBackgroundPhoto(user.id, file);
      update((s) => ({ ...s, background: { ...s.background, mode: "photo", photoPath: path } }));
    } catch (err) {
      console.warn("background photo upload failed", err);
    } finally {
      setBgUploading(false);
    }
  }

  function removeBackgroundPhoto() {
    update((s) => ({
      ...s,
      background: { ...s.background, mode: "default", photoPath: undefined },
    }));
  }

  function setBackgroundDim(raw: string) {
    const n = Math.min(90, Math.max(0, Math.round(Number(raw) || 0)));
    update((s) => ({ ...s, background: { ...s.background, dimOpacity: n } }));
  }

  function applyCardColorPreset(color: string | null) {
    update((s) => ({
      ...s,
      cardColor: color ? { mode: "color", color } : { mode: "default", color: s.cardColor.color },
    }));
  }

  function setCustomCardColor(hex: string) {
    if (!isValidHex(hex)) return;
    update((s) => ({ ...s, cardColor: { mode: "color", color: hex } }));
  }

  const activePreset = findMatchingPreset(state.accentColors);
  const primaryWarning = accentContrastWarning(state.accentColors.primary);
  const secondaryWarning = accentContrastWarning(state.accentColors.secondary);

  const activeBgPreset = BACKGROUND_PRESETS.find(
    (p) =>
      (p.color === null && state.background.mode === "default") ||
      (p.color !== null &&
        state.background.mode === "color" &&
        p.color.toLowerCase() === state.background.color.toLowerCase()),
  );
  const bgWarning =
    state.background.mode === "color" ? backgroundContrastWarning(state.background.color) : null;

  const activeCardPreset = CARD_COLOR_PRESETS.find(
    (p) =>
      (p.color === null && state.cardColor.mode === "default") ||
      (p.color !== null &&
        state.cardColor.mode === "color" &&
        p.color.toLowerCase() === state.cardColor.color.toLowerCase()),
  );
  const cardSimilarityWarning = backgroundCardSimilarityWarning(state.background, state.cardColor);

  return (
    <div className="space-y-5">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {SETTINGS_CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Icon size={14} />
              {c.label}
            </button>
          );
        })}
      </div>

      {category === "game" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Установка приложения</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Установи Life RPG как обычное приложение — быстрее открывается, работает в отдельном
            окне без адресной строки браузера.
          </p>
          <div className="mt-3">
            <InstallAppButton />
          </div>
        </section>
      )}

      {category === "account" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Аккаунт</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {/* Passwordless by design (see lib/auth.ts) — sign-in is only ever
                magic-link email or Google OAuth, so there's genuinely no
                password to change here, not a missing feature. */}
            Вход по magic-ссылке на email или через Google — отдельного пароля в приложении нет,
            менять нечего.
          </p>
          <div className="mt-3 rounded-xl border border-border bg-secondary px-4 py-3">
            <div className="text-xs text-muted-foreground">Email</div>
            <div className="mt-0.5 truncate text-sm font-medium">{user?.email ?? "—"}</div>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-destructive/50 hover:text-destructive"
          >
            Выйти
          </button>
        </section>
      )}

      {category === "privacy" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Мой код друга</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Неизменяемый код — только по нему друзья могут найти тебя и добавить в друзья (не по
            имени и не по email). Скинь его текстом тому, кого хочешь добавить.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-4 py-3">
            <div className="text-xl font-semibold tracking-widest">
              {myCode ?? (myCodeLoading ? "…" : "—")}
            </div>
            <button
              type="button"
              disabled={!myCode}
              onClick={copyMyCode}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              {codeCopied ? "Скопировано ✓" : "Скопировать"}
            </button>
          </div>
        </section>
      )}

      {category === "account" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Как тебя зовут в игре?</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Это имя видно на главном экране и в таблице рейтингов у друзей.
          </p>
          <div className="mt-3">
            <AutosaveField
              value={state.name}
              placeholder="Герой"
              ariaLabel="Имя персонажа"
              onCommit={commitName}
            />
          </div>
        </section>
      )}

      {category === "game" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Залог</h2>
          {state.depositEnabled ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Ставка на самого себя: эта сумма «замораживается» на {state.depositDurationDays}{" "}
                дней. Закрывай все ежедневные квесты каждый день — и получишь её обратно полностью.
                Не получишь обратно часть суммы, если будешь пропускать слишком часто.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Текущая сумма:{" "}
                <span className="font-medium text-foreground">${state.depositAmount}</span>
                {" · "}
                {state.depositDurationDays} дней
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDepositModalOpen(true)}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-secondary"
                >
                  Изменить
                </button>
                <button
                  type="button"
                  onClick={disableDeposit}
                  className="rounded-full border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-all hover:-translate-y-0.5 hover:bg-destructive/10"
                >
                  Отключить залог
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Необязательная функция. Если хочешь мотивацию посерьёзнее — настрой сумму (не
                обязательно реальные деньги, можно и символическую цифру) и срок, на который она
                «замораживается».
              </p>
              <button
                type="button"
                onClick={() => setDepositModalOpen(true)}
                className="mt-3 rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-all hover:-translate-y-0.5 hover:bg-primary/10"
              >
                Настроить залог
              </button>
            </>
          )}
        </section>
      )}

      {depositModalOpen && (
        <DepositSetupModal
          initialAmount={state.depositAmount}
          initialDurationDays={state.depositDurationDays}
          onConfirm={confirmDepositSetup}
          onCancel={() => setDepositModalOpen(false)}
        />
      )}

      {category === "notifications" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Напоминания</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Настоящие push-уведомления — приходят даже если вкладка или браузер закрыты. Раз в день,
            в выбранное ниже время, если остались незакрытые ежедневные квесты.
          </p>

          <div className="mt-3">
            <label className="text-xs text-muted-foreground" htmlFor="reminder-hour">
              Время напоминания
            </label>
            <select
              id="reminder-hour"
              value={state.reminderHour}
              onChange={(e) => setReminderHour(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              По часовому поясу устройства, на котором это включалось ({state.reminderTimezone}) —
              рассылка проверяет твой выбранный час каждый час, а не только один раз в сутки.
            </p>
          </div>

          {!isPushSupported() && (
            <p className="mt-3 text-xs text-muted-foreground">
              Этот браузер не поддерживает push-уведомления.
            </p>
          )}

          {pushError && (
            <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-destructive">
              {pushError}
            </p>
          )}

          {isPushSupported() && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {state.remindersEnabled ? "Включены" : "Выключены"}
              </span>
              <button
                type="button"
                disabled={pushBusy}
                onClick={state.remindersEnabled ? handleDisableReminders : handleEnableReminders}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                  state.remindersEnabled
                    ? "border border-border hover:bg-secondary"
                    : "btn-accent-hover bg-primary text-primary-foreground"
                }`}
              >
                {pushBusy
                  ? "Подождите…"
                  : state.remindersEnabled
                    ? "Выключить"
                    : "Включить напоминания"}
              </button>
            </div>
          )}
        </section>
      )}

      {category === "game" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Звуки</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Короткие звуковые эффекты при выполнении квеста, левел-апе, разблокировке достижения и
            покупке в магазине.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {state.soundEnabled ? "Включены" : "Выключены"}
            </span>
            <button
              type="button"
              onClick={() => update((s) => ({ ...s, soundEnabled: !s.soundEnabled }))}
              className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-secondary"
            >
              {state.soundEnabled ? "Выключить" : "Включить"}
            </button>
          </div>
        </section>
      )}

      {category === "game" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">График работы</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            В рабочий день ежедневные квесты автоматически облегчаются (короткая разминка вместо
            полной тренировки и т.п.), в выходной — доступна полная версия. Сегодня по этому
            графику:{" "}
            <span className="font-medium text-foreground">
              {isWorkDay(state.schedule) ? "рабочий день" : "выходной"}
            </span>
            .
          </p>

          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => setScheduleMode("weekly")}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                state.schedule.mode === "weekly"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              По дням недели
            </button>
            <button
              type="button"
              onClick={() => setScheduleMode("cycle")}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                state.schedule.mode === "cycle"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              Смены (цикл)
            </button>
          </div>

          {state.schedule.mode === "weekly" ? (
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Отметь рабочие дни недели — подходит для 5/2 или любого другого свободного паттерна.
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_LABELS.map((label, i) => {
                  const isWorkDayOfWeek = state.schedule.weeklyWorkDays[i];
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleWeekday(i)}
                      className={`rounded-lg px-1 py-2 text-xs font-medium transition-colors ${
                        isWorkDayOfWeek
                          ? "bg-primary text-primary-foreground"
                          : "border border-border text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Подходит для смен, которые не привязаны к дням недели — например 2/2 или 4/3.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Рабочих дней подряд</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={state.schedule.cycleWorkDays}
                    onChange={(e) => setCycleField("cycleWorkDays", e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Дней отдыха подряд</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={state.schedule.cycleRestDays}
                    onChange={(e) => setCycleField("cycleRestDays", e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Первый день текущего рабочего блока
                </label>
                <input
                  type="date"
                  value={state.schedule.cycleAnchor}
                  onChange={(e) => setCycleAnchor(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {category === "appearance" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Тема</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Быстрый переключатель есть и в шапке приложения — здесь то же самое, просто рядом с
            остальным оформлением.
          </p>
          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                theme === "light"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              Светлая
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                theme === "dark"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              Тёмная
            </button>
          </div>
        </section>
      )}

      {category === "appearance" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Персонализация</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Акцентные цвета приложения — фон и текст остаются как есть, меняются только кнопки,
            прогресс-бары и теги.
          </p>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Готовые наборы</p>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((preset) => {
                const active = activePreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.colors)}
                    title={preset.label}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 ${
                      active ? "border-primary bg-secondary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    <span className="flex h-4 w-4 overflow-hidden rounded-full border border-border/60">
                      <span className="w-1/2" style={{ background: preset.colors.primary }} />
                      <span className="w-1/2" style={{ background: preset.colors.secondary }} />
                    </span>
                    {preset.label}
                    {active && <span className="text-primary">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Свои цвета</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Основной акцент</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={state.accentColors.primary}
                    onChange={(e) => setCustomColor("primary", e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                    aria-label="Основной акцент"
                  />
                  <span className="text-xs text-muted-foreground">
                    {state.accentColors.primary}
                  </span>
                </div>
                {primaryWarning && (
                  <p className="mt-1.5 text-[11px] text-destructive">{primaryWarning}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Вторичный акцент</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={state.accentColors.secondary}
                    onChange={(e) => setCustomColor("secondary", e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                    aria-label="Вторичный акцент"
                  />
                  <span className="text-xs text-muted-foreground">
                    {state.accentColors.secondary}
                  </span>
                </div>
                {secondaryWarning && (
                  <p className="mt-1.5 text-[11px] text-destructive">{secondaryWarning}</p>
                )}
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Оттенки для наведения и обеих тем (светлой/тёмной) подбираются автоматически.
            </p>
          </div>
        </section>
      )}

      {category === "appearance" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Персонализация — фон</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Настрой цвет фона за пределами карточек (или свою фотографию) и, отдельно, цвет самих
            карточек ниже — текст везде подстраивается автоматически.
          </p>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Готовые варианты</p>
            <div className="flex flex-wrap gap-2">
              {BACKGROUND_PRESETS.map((preset) => {
                const active = activeBgPreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyBackgroundPreset(preset.color)}
                    title={preset.label}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 ${
                      active ? "border-primary bg-secondary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-border/60"
                      style={{ background: preset.color ?? "var(--color-background)" }}
                    />
                    {preset.label}
                    {active && <span className="text-primary">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Свой цвет</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={
                  isValidHex(state.background.color)
                    ? state.background.color
                    : DEFAULT_BACKGROUND.color
                }
                onChange={(e) => setCustomBackgroundColor(e.target.value)}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                aria-label="Свой цвет фона"
              />
              <span className="text-xs text-muted-foreground">{state.background.color}</span>
            </div>
            {bgWarning && <p className="mt-1.5 text-[11px] text-destructive">{bgWarning}</p>}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Оттенок подстраивается под каждую тему — почти белый на светлой, почти чёрный на
              тёмной — так же, как акцентные цвета.
            </p>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Своя фотография</p>
            <input
              ref={bgFileRef}
              type="file"
              accept="image/*"
              onChange={handleBackgroundFile}
              className="hidden"
            />
            {state.background.mode === "photo" && state.background.photoPath ? (
              <div className="flex items-center gap-3">
                {bgPreviewUrl && (
                  <img
                    src={bgPreviewUrl}
                    alt=""
                    className="h-14 w-14 rounded-lg border border-border object-cover"
                  />
                )}
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    disabled={bgUploading}
                    onClick={() => bgFileRef.current?.click()}
                    className="text-left text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                  >
                    {bgUploading ? "Загрузка…" : "Заменить фото"}
                  </button>
                  <button
                    type="button"
                    onClick={removeBackgroundPhoto}
                    className="text-left text-xs text-destructive underline hover:opacity-80"
                  >
                    Убрать фото
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={bgUploading}
                onClick={() => bgFileRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bgUploading ? "Загрузка…" : "🖼️ Загрузить фотографию фона"}
              </button>
            )}

            {state.background.mode === "photo" && (
              <div className="mt-3">
                <label className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Затемнение</span>
                  <span>{state.background.dimOpacity}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={90}
                  value={state.background.dimOpacity}
                  onChange={(e) => setBackgroundDim(e.target.value)}
                  className="mt-1.5 w-full accent-primary"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Затемняющий слой поверх фото — подбери так, чтобы карточки и текст было удобно
                  читать.
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-border pt-5">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Цвет карточек</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Текст внутри карточек сам подстраивается под выбранный цвет — тёмная карточка получит
              светлый текст, светлая — тёмный.
            </p>
            <div className="flex flex-wrap gap-2">
              {CARD_COLOR_PRESETS.map((preset) => {
                const active = activeCardPreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyCardColorPreset(preset.color)}
                    title={preset.label}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 ${
                      active ? "border-primary bg-secondary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-border/60"
                      style={{ background: preset.color ?? "var(--color-card)" }}
                    />
                    {preset.label}
                    {active && <span className="text-primary">✓</span>}
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Свой цвет</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={
                    isValidHex(state.cardColor.color)
                      ? state.cardColor.color
                      : DEFAULT_CARD_COLOR.color
                  }
                  onChange={(e) => setCustomCardColor(e.target.value)}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                  aria-label="Свой цвет карточек"
                />
                <span className="text-xs text-muted-foreground">{state.cardColor.color}</span>
              </div>
              {cardSimilarityWarning && (
                <p className="mt-1.5 text-[11px] text-destructive">{cardSimilarityWarning}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {category === "account" && (
        <section className="panel p-6">
          <h2 className="text-sm font-semibold">Резервная копия</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Сохрани весь свой прогресс (квесты, характеристики, залог, питание) в один файл — на
            случай, если захочешь перенести его или просто иметь копию про запас.
          </p>
          <button
            type="button"
            onClick={exportBackup}
            className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-secondary"
          >
            Скачать резервную копию
          </button>
        </section>
      )}

      {category === "account" && (
        <section className="panel border-destructive/30 p-6">
          <h2 className="text-sm font-semibold text-destructive">Опасная зона</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Обнулит уровень, характеристики, квесты, залог и питание — начнёшь с чистого листа.
            Отменить это будет нельзя, так что сначала лучше скачай резервную копию выше.
          </p>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="mt-3 rounded-full border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-all hover:-translate-y-0.5 hover:bg-destructive/10"
          >
            Сбросить весь прогресс
          </button>
        </section>
      )}

      {category === "privacy" && (
        <div className="flex justify-center gap-4 pt-2 text-xs text-muted-foreground">
          <Link to="/privacy" className="underline-offset-2 hover:text-foreground hover:underline">
            Политика конфиденциальности
          </Link>
          <Link to="/terms" className="underline-offset-2 hover:text-foreground hover:underline">
            Условия использования
          </Link>
        </div>
      )}

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
