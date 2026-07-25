import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileHeader } from "@/components/ProfileHeader";
import { StatBar } from "@/components/StatBar";
import { QuestCard } from "@/components/QuestCard";
import { DepositWidget } from "@/components/DepositWidget";
import { DisciplineCalendar } from "@/components/DisciplineCalendar";
import { SeasonProgress } from "@/components/SeasonProgress";
import { SeasonSummaryModal } from "@/components/SeasonSummaryModal";
import { StreakBanner } from "@/components/StreakBanner";
import { UndoToast } from "@/components/UndoToast";
import { WorkScheduleStatus } from "@/components/WorkScheduleStatus";
import { useGameStateContext } from "@/lib/use-game-state-context";
import {
  applyReward,
  CATEGORY_META,
  computeDiscipline,
  computeStreak,
  effectiveQuest,
  ensureBonusQuests,
  ensureDailyRotation,
  ensureSeason,
  isWorkDay,
  sortByStatOrder,
  STAT_META,
  STAT_ORDER,
  STREAK_MILESTONES,
  todayKey,
  undoReward,
  type Quest,
  type QuestCategory,
  type StatKey,
} from "@/lib/game";

const UNDO_WINDOW_MS = 10_000;

interface PendingUndo {
  id: number;
  title: string;
  questId: string;
  source: "quests" | "bonusQuests";
  stat: StatKey;
  reward: number;
  /** Set only for daily-category quests, to also remove them from dailyCompletions on undo. */
  dailyKey?: string;
  expiresAt: number;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Life RPG — Геймификация жизни" },
      {
        name: "description",
        content: "Личный RPG-трекер: квесты, залог $1000 и календарь дисциплины.",
      },
    ],
  }),
  component: Home,
});

interface FloatXp {
  id: number;
  text: string;
  color: string;
  x: number;
  y: number;
}

function Home() {
  const { state, update, hydrated } = useGameStateContext();
  const [floats, setFloats] = useState<FloatXp[]>([]);
  const [levelPulse, setLevelPulse] = useState(false);
  const [tab, setTab] = useState<QuestCategory>("daily");
  const floatId = useRef(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Undo window: only the single most recent completion can be undone —
  // completing another quest replaces it rather than stacking.
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const undoId = useRef(0);

  useEffect(() => {
    if (!pendingUndo) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((pendingUndo.expiresAt - Date.now()) / 1000));
      setUndoSecondsLeft(left);
      if (left <= 0) setPendingUndo(null);
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [pendingUndo]);

  function handleUndo() {
    if (!pendingUndo) return;
    const { questId, source, stat, reward, dailyKey } = pendingUndo;
    update((s) => {
      let next = undoReward(s, stat, reward);
      if (source === "quests") {
        next = {
          ...next,
          quests: next.quests.map((q) =>
            q.id === questId
              ? { ...q, done: false, completedAt: undefined, proofNote: undefined }
              : q,
          ),
        };
        if (dailyKey) {
          const arr = (next.dailyCompletions[dailyKey] ?? []).filter((qid) => qid !== questId);
          next = { ...next, dailyCompletions: { ...next.dailyCompletions, [dailyKey]: arr } };
        }
      } else {
        next = {
          ...next,
          bonusQuests: next.bonusQuests.map((q) =>
            q.id === questId ? { ...q, done: false, completedAt: undefined } : q,
          ),
        };
      }
      return next;
    });
    setPendingUndo(null);
  }

  // Draw today's daily-quest rotation, keep today's bonus quest set current,
  // and roll the season over once its 30 days are up.
  useEffect(() => {
    if (!hydrated) return;
    const run = () => update((s) => ensureSeason(ensureBonusQuests(ensureDailyRotation(s))));
    run();
    const t = setInterval(run, 60_000);
    return () => clearInterval(t);
  }, [hydrated, update]);

  const disc = useMemo(() => (hydrated ? computeDiscipline(state) : null), [state, hydrated]);
  const streak = useMemo(() => (hydrated ? computeStreak(state) : 0), [state, hydrated]);
  const longestStreak = Math.max(state.longestStreak, streak);

  const [milestone, setMilestone] = useState<number | null>(null);
  const prevStreak = useRef(streak);

  // Persist a new all-time-longest streak.
  useEffect(() => {
    if (!hydrated) return;
    if (streak > state.longestStreak) {
      update((s) => ({ ...s, longestStreak: Math.max(s.longestStreak, streak) }));
    }
  }, [streak, hydrated, state.longestStreak, update]);

  // Celebrate crossing a round milestone (7/30/100) during this session. On
  // mount prevStreak is seeded to the current value, so a reload of an
  // already-high streak won't re-trigger — only an actual increment does.
  useEffect(() => {
    if (!hydrated) return;
    const before = prevStreak.current;
    prevStreak.current = streak;
    if (streak <= before) return;
    const hit = STREAK_MILESTONES.filter((m) => m > before && m <= streak).pop();
    if (hit) {
      setMilestone(hit);
      const t = setTimeout(() => setMilestone(null), 3500);
      return () => clearTimeout(t);
    }
  }, [streak, hydrated]);

  function completeQuest(
    id: string,
    _photoPath: string | undefined,
    note: string | undefined,
    e?: React.MouseEvent,
  ) {
    const quest = state.quests.find((q) => q.id === id);
    if (!quest || quest.done) return;
    const meta = STAT_META[quest.stat];
    const rect = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
    const fid = ++floatId.current;
    setFloats((f) => [
      ...f,
      {
        id: fid,
        text: `+${quest.reward} ${meta.label}`,
        color: meta.color,
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top : window.innerHeight / 2,
      },
    ]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== fid)), 1100);

    update((s) => {
      const prev = s.level;
      const rewarded = applyReward(s, quest.stat, quest.reward);
      if (rewarded.level > prev) {
        setTimeout(() => {
          setLevelPulse(true);
          setTimeout(() => setLevelPulse(false), 1500);
        }, 200);
      }
      // record daily completion
      const dailyCompletions = { ...rewarded.dailyCompletions };
      if (quest.category === "daily") {
        const k = todayKey();
        const arr = dailyCompletions[k] ? [...dailyCompletions[k]] : [];
        if (!arr.includes(quest.id)) arr.push(quest.id);
        dailyCompletions[k] = arr;
      }
      return {
        ...rewarded,
        dailyCompletions,
        quests: rewarded.quests.map((q) =>
          q.id === id
            ? {
                ...q,
                done: true,
                completedAt: Date.now(),
                lastResetDate: todayKey(),
                proofNote: note || q.proofNote,
              }
            : q,
        ),
      };
    });

    setPendingUndo({
      id: ++undoId.current,
      title: quest.title,
      questId: id,
      source: "quests",
      stat: quest.stat,
      reward: quest.reward,
      dailyKey: quest.category === "daily" ? todayKey() : undefined,
      expiresAt: Date.now() + UNDO_WINDOW_MS,
    });
  }

  function completeBonusQuest(
    id: string,
    _photoPath: string | undefined,
    _note: string | undefined,
    e?: React.MouseEvent,
  ) {
    const quest = state.bonusQuests.find((q) => q.id === id);
    if (!quest || quest.done) return;
    const meta = STAT_META[quest.stat];
    const rect = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
    const fid = ++floatId.current;
    setFloats((f) => [
      ...f,
      {
        id: fid,
        text: `+${quest.reward} ${meta.label}`,
        color: meta.color,
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top : window.innerHeight / 2,
      },
    ]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== fid)), 1100);

    update((s) => {
      const prev = s.level;
      const rewarded = applyReward(s, quest.stat, quest.reward);
      if (rewarded.level > prev) {
        setTimeout(() => {
          setLevelPulse(true);
          setTimeout(() => setLevelPulse(false), 1500);
        }, 200);
      }
      return {
        ...rewarded,
        bonusQuests: rewarded.bonusQuests.map((q) =>
          q.id === id ? { ...q, done: true, completedAt: Date.now() } : q,
        ),
      };
    });

    setPendingUndo({
      id: ++undoId.current,
      title: quest.title,
      questId: id,
      source: "bonusQuests",
      stat: quest.stat,
      reward: quest.reward,
      expiresAt: Date.now() + UNDO_WINDOW_MS,
    });
  }

  function togglChecklist(qid: string, itemId: string) {
    update((s) => ({
      ...s,
      quests: s.quests.map((q) =>
        q.id === qid && q.checklist
          ? {
              ...q,
              checklist: q.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
            }
          : q,
      ),
    }));
  }

  function setPhoto(id: string, path: string) {
    update((s) => ({
      ...s,
      quests: s.quests.map((q) => (q.id === id ? { ...q, photoPath: path } : q)),
    }));
  }

  function deleteQuest(id: string) {
    update((s) => ({ ...s, quests: s.quests.filter((q) => q.id !== id) }));
  }

  if (!hydrated) return null;

  const isWork = isWorkDay(state.schedule);
  const questsByCat = state.quests
    .filter((q) => q.category === tab)
    .filter((q) => !q.dayOffOnly || !isWork)
    .map((q) => effectiveQuest(q, isWork));
  // Grouped by characteristic in the app-wide fixed order (Сила → Интеллект
  // → Воля → Харизма) rather than creation/rotation order, so quests of the
  // same stat sit together instead of appearing in a random jumble.
  const active = sortByStatOrder(questsByCat.filter((q) => !q.done));
  const done = sortByStatOrder(questsByCat.filter((q) => q.done));
  const lost = disc?.lost;

  const dailyQuests = state.quests.filter((q) => q.category === "daily");
  const noActiveDailies = dailyQuests.length > 0 && dailyQuests.every((q) => q.done);
  const bonusActive = sortByStatOrder(state.bonusQuests.filter((q) => !q.done));
  const bonusDone = sortByStatOrder(state.bonusQuests.filter((q) => q.done));

  return (
    <div className="mx-auto max-w-4xl px-3 pb-24 pt-4 sm:px-4 sm:pt-8">
      <TabNav pathname={pathname} />

      <div className="space-y-5 sm:space-y-7">
        <ProfileHeader
          state={state}
          onChangeAvatar={(a) => update((s) => ({ ...s, avatar: a }))}
          onChangeName={(n) => update((s) => ({ ...s, name: n }))}
          levelUpPulse={levelPulse}
        />

        <StreakBanner current={streak} longest={longestStreak} />

        <WorkScheduleStatus isWork={isWork} />

        <SeasonProgress season={state.season} />

        <DepositWidget state={state} />

        <section>
          <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">
            Характеристики
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {STAT_ORDER.map((k) => (
              <StatBar key={k} stat={k} level={state.stats[k].level} xp={state.stats[k].xp} />
            ))}
          </div>
        </section>

        <DisciplineCalendar state={state} update={update} />

        <section>
          <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">Квесты</h2>
          <div className="mb-3 grid grid-cols-3 gap-1.5 sm:gap-2">
            {(Object.keys(CATEGORY_META) as QuestCategory[]).map((c) => {
              const active = tab === c;
              const meta = CATEGORY_META[c];
              return (
                <button
                  key={c}
                  onClick={() => setTab(c)}
                  className={`rounded-xl border px-2.5 py-2 text-left transition-colors duration-200 ${
                    active ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"
                  }`}
                >
                  <div
                    className={`text-xs font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {meta.icon} {meta.label.replace(" квесты", "")}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                    {meta.description}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {active.length === 0 && done.length === 0 && (
              <div className="panel p-8 text-center">
                <div className="text-3xl">{CATEGORY_META[tab].icon}</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Пока нет квестов в этой категории — начни свой первый!
                </p>
              </div>
            )}
            {active.length === 0 && done.length > 0 && (
              <div className="panel p-6 text-center text-sm text-muted-foreground">
                🏆 Все квесты этой категории выполнены. Легенда.
              </div>
            )}
            {active.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                body={state.body}
                onComplete={completeQuest}
                onToggleChecklist={togglChecklist}
                onDelete={deleteQuest}
                onPhoto={setPhoto}
              />
            ))}
          </div>

          {done.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
                Выполнено ({done.length})
              </h3>
              <div className="space-y-2">
                {done.map((q) => (
                  <QuestCard
                    key={q.id}
                    quest={q}
                    body={state.body}
                    onComplete={() => {}}
                    onToggleChecklist={togglChecklist}
                    onDelete={deleteQuest}
                    onPhoto={setPhoto}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {noActiveDailies && (bonusActive.length > 0 || bonusDone.length > 0) && (
          <section>
            <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">
              ✨ Дополнительно
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Все ежедневные квесты выполнены — вот пара лёгких бонусов с наградой ×1.5.
            </p>
            <div className="space-y-3">
              {bonusActive.map((q: Quest) => (
                <QuestCard
                  key={q.id}
                  quest={q}
                  body={state.body}
                  onComplete={completeBonusQuest}
                  onDelete={() =>
                    update((s) => ({
                      ...s,
                      bonusQuests: s.bonusQuests.filter((b) => b.id !== q.id),
                    }))
                  }
                  onPhoto={() => {}}
                />
              ))}
              {bonusDone.map((q: Quest) => (
                <QuestCard
                  key={q.id}
                  quest={q}
                  body={state.body}
                  onComplete={() => {}}
                  onDelete={() =>
                    update((s) => ({
                      ...s,
                      bonusQuests: s.bonusQuests.filter((b) => b.id !== q.id),
                    }))
                  }
                  onPhoto={() => {}}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="pointer-events-none fixed inset-0 z-50">
        {floats.map((f) => (
          <div
            key={f.id}
            className="animate-xp-pop absolute text-lg font-semibold"
            style={{ left: f.x, top: f.y, color: f.color, transform: "translate(-50%, -100%)" }}
          >
            {f.text}
          </div>
        ))}
      </div>

      {pendingUndo && (
        <UndoToast
          title={pendingUndo.title}
          secondsLeft={undoSecondsLeft}
          onUndo={handleUndo}
          onDismiss={() => setPendingUndo(null)}
        />
      )}

      {milestone != null && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-[120] flex justify-center px-4">
          <div className="animate-level-up rounded-full border border-primary/40 bg-card px-5 py-2.5 text-center shadow-lg">
            <span className="text-lg">🔥</span>{" "}
            <span className="text-sm font-semibold text-foreground">
              {milestone} дней подряд — новая веха!
            </span>
          </div>
        </div>
      )}

      {lost && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="panel-glow max-w-md p-8 text-center">
            <div className="text-xs font-medium tracking-wide text-destructive">Игра окончена</div>
            <div className="mt-2 text-3xl font-semibold text-destructive">Ты проиграл</div>
            <p className="mt-4 text-sm text-muted-foreground">
              $1000 сгорели. Ты не выполнил условия 30-дневного залога.
            </p>
            <Link
              to="/achievements"
              className="mt-6 inline-block rounded-full border border-destructive/40 px-4 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              К достижениям
            </Link>
          </div>
        </div>
      )}

      {state.lastSeasonSummary && !state.seasonSummarySeen && (
        <SeasonSummaryModal
          summary={state.lastSeasonSummary}
          onContinue={() => update((s) => ({ ...s, seasonSummarySeen: true }))}
        />
      )}
    </div>
  );
}

export function TabNav({ pathname }: { pathname: string }) {
  const tabs = [
    { to: "/", label: "Профиль" },
    { to: "/nutrition", label: "Питание" },
    { to: "/body", label: "Тело" },
    { to: "/friends", label: "Друзья" },
    { to: "/achievements", label: "Достижения" },
  ] as const;
  return (
    <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="inline-flex w-max rounded-full border border-border bg-secondary p-1">
          {tabs.map((t) => {
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/settings"
          aria-label="Настройки"
          title="Настройки"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-all hover:scale-110 ${
            pathname === "/settings"
              ? "border-primary text-primary"
              : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          }`}
        >
          <Settings size={15} />
        </Link>
        <ThemeToggle />
      </div>
    </div>
  );
}
