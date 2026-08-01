import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  BarChart3,
  Home as HomeIcon,
  MoreHorizontal,
  Plus,
  Settings,
  ShoppingBag,
  Trophy,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileHeader } from "@/components/ProfileHeader";
import { StatBar } from "@/components/StatBar";
import { StatSkillTree } from "@/components/StatSkillTree";
import { QuestCard } from "@/components/QuestCard";
import { AddQuestModal } from "@/components/AddQuestModal";
import { DepositSection } from "@/components/DepositSection";
import { BossQuestCard } from "@/components/BossQuestCard";
import { MarathonCard } from "@/components/MarathonCard";
import { DisciplineCalendar } from "@/components/DisciplineCalendar";
import { SeasonProgress } from "@/components/SeasonProgress";
import { SeasonSummaryModal } from "@/components/SeasonSummaryModal";
import { WeeklyReportModal } from "@/components/WeeklyReportModal";
import { FeedbackToast } from "@/components/FeedbackToast";
import { StreakBanner } from "@/components/StreakBanner";
import { UndoToast } from "@/components/UndoToast";
import { WorkScheduleStatus } from "@/components/WorkScheduleStatus";
import { useGameStateContext } from "@/lib/use-game-state-context";
import { abandonMarathon, ensureMarathonRollover, startMarathon } from "@/lib/marathons";
import { playLevelUp, playQuestComplete } from "@/lib/sound";
import {
  applyReward,
  type BigGoalIdea,
  CATEGORY_META,
  computeDiscipline,
  computeStreak,
  createQuest,
  createQuestFromIdea,
  effectiveQuest,
  ensureBonusQuests,
  ensureDailyMandatoryCount,
  ensureDailyQuestsReset,
  ensureSeason,
  ensureWeekRollover,
  isQuestPostponedOn,
  isWorkDay,
  canPostponeQuest,
  checkBossQuestCompletion,
  pickFeedbackMessage,
  postponeQuest,
  POSTPONE_PRICE_GOLD,
  QUEST_IDEA_POOL,
  registerQuestActivity,
  sortByStatOrder,
  sortQuestsForDisplay,
  STARTER_QUEST_IDEAS,
  STAT_META,
  STAT_ORDER,
  STREAK_MILESTONES,
  todayKey,
  TRAINING_FEEDBACK_MESSAGES,
  undoReward,
  type Quest,
  type QuestCategory,
  type QuestIdeaTemplate,
  type StatKey,
} from "@/lib/game";
import { DailyOnboardingPrompt } from "@/components/DailyOnboardingPrompt";
import { QuestIdeaCatalog } from "@/components/QuestIdeaCatalog";
import { RandomGoalRoller } from "@/components/RandomGoalRoller";
import { LoadingScreen } from "@/components/LoadingScreen";

const UNDO_WINDOW_MS = 10_000;

/** True right around midnight (00:00–00:04) — backs the "Полуночный герой"
 * hidden achievement (see achievements.ts). Deliberately a few minutes wide
 * rather than the literal single instant of 00:00:00, so it's actually
 * reachable rather than requiring frame-perfect timing. */
function isMidnightWindow(d = new Date()): boolean {
  return d.getHours() === 0 && d.getMinutes() < 5;
}

/** "+ Добавить ..." button label, per quest category — all three tabs are
 * user-populated now (see game.ts), so each needs its own copy. */
const ADD_QUEST_LABEL: Record<QuestCategory, string> = {
  daily: "Добавить ежедневный квест",
  story: "Добавить цель",
  purchase: "Добавить крупную цель",
};

/** Empty-state prompt copy, per quest category. Daily's empty state is
 * normally pre-empted by DailyOnboardingPrompt (see showDailyOnboarding) for
 * a brand-new account — this copy only shows once that's been dismissed and
 * the user has since deleted every daily quest. */
const EMPTY_STATE_COPY: Record<QuestCategory, string> = {
  daily: "У тебя пока нет ежедневных квестов — добавь свой первый!",
  story: "У тебя пока нет сюжетных целей — добавь первую или загляни в каталог идей выше!",
  purchase: "У тебя пока нет крупных целей — добавь первую!",
};

interface PendingUndo {
  id: number;
  title: string;
  questId: string;
  source: "quests" | "bonusQuests";
  stat: StatKey;
  category: QuestCategory;
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
        content:
          "Личный RPG-трекер: квесты, календарь дисциплины и опциональный символический залог.",
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
  const [addQuestOpen, setAddQuestOpen] = useState(false);
  // Set by RandomGoalRoller's "Добавить как есть" — opens AddQuestModal
  // pre-filled with the rolled idea instead of saving it straight away, so
  // the wording stays editable. Cleared whenever the modal closes.
  const [goalPrefill, setGoalPrefill] = useState<BigGoalIdea | null>(null);
  const floatId = useRef(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Instant qualitative feedback shown after completing a strength (training)
  // quest — see TRAINING_FEEDBACK_MESSAGES in game.ts. Separate from the
  // undo toast (different position) so the two can never visually collide.
  const [feedback, setFeedback] = useState<{ id: number; message: string } | null>(null);
  const feedbackId = useRef(0);

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
    const { questId, source, stat, category, reward, dailyKey } = pendingUndo;
    update((s) => {
      let next = registerQuestActivity(undoReward(s, stat, reward), stat, category, reward, -1);
      next = { ...next, everUsedUndo: true };
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

  // Reset any daily quest completed on a previous day back to not-done,
  // record today's mandatory daily-quest count (for the discipline
  // calendar's historical accounting), keep today's bonus quest set current,
  // and roll the season over once its 30 days are up.
  useEffect(() => {
    if (!hydrated) return;
    const run = () =>
      update((s) =>
        ensureMarathonRollover(
          checkBossQuestCompletion(
            ensureWeekRollover(
              ensureSeason(ensureBonusQuests(ensureDailyMandatoryCount(ensureDailyQuestsReset(s)))),
            ),
          ),
        ),
      );
    run();
    const t = setInterval(run, 60_000);
    return () => clearInterval(t);
  }, [hydrated, update]);

  const disc = useMemo(() => (hydrated ? computeDiscipline(state) : null), [state, hydrated]);
  const streak = useMemo(() => (hydrated ? computeStreak(state) : 0), [state, hydrated]);
  const longestStreak = Math.max(state.longestStreak, streak);

  const [milestone, setMilestone] = useState<number | null>(null);
  // View preference for the "Характеристики" section (skill-tree vs flat
  // cards) — deliberately local UI state rather than a new GameState field:
  // it's a display toggle, not game data, so there's nothing to sync or
  // persist across devices; defaulting to the new tree view each visit is
  // the simplest option and also the best way to surface the new feature.
  const [statView, setStatView] = useState<"tree" | "cards">("tree");
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
      const rewarded = registerQuestActivity(
        applyReward(s, quest.stat, quest.reward),
        quest.stat,
        quest.category,
        quest.reward,
        1,
      );
      playQuestComplete(s.soundEnabled);
      if (rewarded.level > prev) {
        playLevelUp(s.soundEnabled);
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
      return checkBossQuestCompletion({
        ...rewarded,
        dailyCompletions,
        midnightQuestDone: rewarded.midnightQuestDone || isMidnightWindow(),
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
      });
    });

    setPendingUndo({
      id: ++undoId.current,
      title: quest.title,
      questId: id,
      source: "quests",
      stat: quest.stat,
      category: quest.category,
      reward: quest.reward,
      dailyKey: quest.category === "daily" ? todayKey() : undefined,
      expiresAt: Date.now() + UNDO_WINDOW_MS,
    });

    // A "physical" quest here means one that trains strength — see
    // TRAINING_FEEDBACK_MESSAGES in game.ts for why this stays qualitative
    // only (no invented kg/muscle numbers).
    if (quest.stat === "strength") {
      setFeedback({
        id: ++feedbackId.current,
        message: pickFeedbackMessage(TRAINING_FEEDBACK_MESSAGES),
      });
    }
  }

  function postponeQuestToTomorrow(id: string) {
    update((s) => postponeQuest(s, id));
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
      const rewarded = registerQuestActivity(
        applyReward(s, quest.stat, quest.reward),
        quest.stat,
        quest.category,
        quest.reward,
        1,
      );
      playQuestComplete(s.soundEnabled);
      if (rewarded.level > prev) {
        playLevelUp(s.soundEnabled);
        setTimeout(() => {
          setLevelPulse(true);
          setTimeout(() => setLevelPulse(false), 1500);
        }, 200);
      }
      return checkBossQuestCompletion({
        ...rewarded,
        midnightQuestDone: rewarded.midnightQuestDone || isMidnightWindow(),
        bonusQuests: rewarded.bonusQuests.map((q) =>
          q.id === id ? { ...q, done: true, completedAt: Date.now() } : q,
        ),
      });
    });

    setPendingUndo({
      id: ++undoId.current,
      title: quest.title,
      questId: id,
      source: "bonusQuests",
      stat: quest.stat,
      category: quest.category,
      reward: quest.reward,
      expiresAt: Date.now() + UNDO_WINDOW_MS,
    });

    if (quest.stat === "strength") {
      setFeedback({
        id: ++feedbackId.current,
        message: pickFeedbackMessage(TRAINING_FEEDBACK_MESSAGES),
      });
    }
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

  function togglePinQuest(id: string) {
    update((s) => ({
      ...s,
      quests: s.quests.map((q) => (q.id === id ? { ...q, pinned: !q.pinned } : q)),
    }));
  }

  function addCustomQuest(input: Parameters<typeof createQuest>[0]) {
    update((s) => ({ ...s, quests: [...s.quests, createQuest(input)] }));
  }

  // Turns one or more QUEST_IDEA_POOL entries into real quests the user now
  // owns — used by both the one-time daily-suggestion prompt (category
  // "daily") and the "Сюжетные" idea catalog's per-item "Добавить" button
  // (category "story").
  function addQuestsFromIdeas(templates: QuestIdeaTemplate[], category: "daily" | "story") {
    update((s) => ({
      ...s,
      quests: [...s.quests, ...templates.map((t) => createQuestFromIdea(t, category))],
    }));
  }

  function dismissDailyOnboarding() {
    update((s) => ({ ...s, dailyOnboardingDismissed: true }));
  }

  if (!hydrated) return <LoadingScreen />;

  const isWork = isWorkDay(state.schedule);
  const todayK = todayKey();
  const questsByCat = state.quests
    .filter((q) => q.category === tab)
    .filter((q) => !q.dayOffOnly || !isWork)
    // Shop-postponed quests (see QuestCard "Отложить") are hidden from
    // today's list entirely — they reappear once postponedUntil arrives.
    .filter((q) => !isQuestPostponedOn(q, todayK))
    .map((q) => effectiveQuest(q, isWork));
  // Grouped by characteristic in the app-wide fixed order (Сила → Интеллект
  // → Воля → Харизма) rather than creation/rotation order, so quests of the
  // same stat sit together instead of appearing in a random jumble. Pinned
  // quests (story/purchase only — see canPinQuest below) float to the top
  // of each list first.
  const active = sortQuestsForDisplay(questsByCat.filter((q) => !q.done));
  const done = sortQuestsForDisplay(questsByCat.filter((q) => q.done));
  const lost = disc?.lost;
  // All three categories are user-populated now (see game.ts — daily quests
  // are no longer an auto-rotated pool), so every tab gets the "add your
  // own" affordance. Pinning stays story/purchase-only (see canPinQuest) —
  // daily is a flat personal checklist rather than a mixed list of one-off
  // goals a user might want to single one out of.
  const canAddQuest = true;
  const canPinQuest = tab === "story" || tab === "purchase";
  const showDailyOnboarding =
    tab === "daily" &&
    !state.dailyOnboardingDismissed &&
    state.quests.every((q) => q.category !== "daily");

  const dailyQuests = state.quests.filter((q) => q.category === "daily");
  const noActiveDailies = dailyQuests.length > 0 && dailyQuests.every((q) => q.done);
  const bonusActive = sortByStatOrder(state.bonusQuests.filter((q) => !q.done));
  const bonusDone = sortByStatOrder(state.bonusQuests.filter((q) => q.done));

  return (
    <div className="mx-auto max-w-4xl px-3 pb-28 pt-4 sm:px-4 sm:pt-8 md:pb-24">
      <TabNav pathname={pathname} />

      <div className="space-y-5 sm:space-y-7">
        <ProfileHeader
          state={state}
          onChangeAvatar={(a) => update((s) => ({ ...s, avatar: a }))}
          onChangeAvatarPhoto={(path) => update((s) => ({ ...s, avatarPhotoPath: path }))}
          onChangeName={(n) => update((s) => ({ ...s, name: n }))}
          levelUpPulse={levelPulse}
        />

        <StreakBanner current={streak} longest={longestStreak} />

        <WorkScheduleStatus isWork={isWork} />

        <SeasonProgress season={state.season} />

        <BossQuestCard state={state} bossQuest={state.bossQuest} />

        <MarathonCard
          state={state}
          onStart={(templateId) => update((s) => startMarathon(s, templateId))}
          onAbandon={() => update((s) => abandonMarathon(s))}
        />

        <DepositSection state={state} />

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
              Характеристики
            </h2>
            <div className="flex shrink-0 gap-1 rounded-full border border-border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatView("tree")}
                className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                  statView === "tree"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                Дерево
              </button>
              <button
                type="button"
                onClick={() => setStatView("cards")}
                className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                  statView === "cards"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                Карточки
              </button>
            </div>
          </div>
          {statView === "tree" ? (
            <StatSkillTree state={state} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {STAT_ORDER.map((k) => (
                <StatBar key={k} stat={k} level={state.stats[k].level} xp={state.stats[k].xp} />
              ))}
            </div>
          )}
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

          {canAddQuest && !showDailyOnboarding && (
            <button
              type="button"
              onClick={() => setAddQuestOpen(true)}
              className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Plus size={15} />
              {ADD_QUEST_LABEL[tab]}
            </button>
          )}

          {tab === "purchase" && (
            <RandomGoalRoller
              state={state}
              update={update}
              onAddAsIs={(idea) => {
                setGoalPrefill(idea);
                setAddQuestOpen(true);
              }}
            />
          )}

          {tab === "story" && (
            <QuestIdeaCatalog
              ideas={QUEST_IDEA_POOL}
              onAdd={(t) => addQuestsFromIdeas([t], "story")}
            />
          )}

          <div className="space-y-3">
            {showDailyOnboarding && (
              <DailyOnboardingPrompt
                ideas={STARTER_QUEST_IDEAS}
                onAdd={(templates) => {
                  addQuestsFromIdeas(templates, "daily");
                  dismissDailyOnboarding();
                }}
                onSkip={dismissDailyOnboarding}
              />
            )}
            {!showDailyOnboarding && active.length === 0 && done.length === 0 && (
              <div className="panel p-8 text-center">
                <div className="text-3xl">{CATEGORY_META[tab].icon}</div>
                <p className="mt-2 text-sm text-muted-foreground">{EMPTY_STATE_COPY[tab]}</p>
                <button
                  type="button"
                  onClick={() => setAddQuestOpen(true)}
                  className="btn-accent-hover mt-4 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5"
                >
                  + Добавить
                </button>
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
                onTogglePin={canPinQuest ? togglePinQuest : undefined}
                onPostpone={tab === "daily" ? postponeQuestToTomorrow : undefined}
                canPostpone={tab === "daily" ? canPostponeQuest(state, q.id) : false}
                postponePrice={POSTPONE_PRICE_GOLD}
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
                    onTogglePin={canPinQuest ? togglePinQuest : undefined}
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

      {feedback && (
        <FeedbackToast
          key={feedback.id}
          message={feedback.message}
          icon="💪"
          onDismiss={() => setFeedback(null)}
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
              Залог в {state.depositAmount} (символически, реальные деньги не списывались) не
              отыгран — условия {state.depositDurationDays}-дневного испытания не выполнены.
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

      {!state.weeklyReportSeen && state.weeklyReports[0] && (
        <WeeklyReportModal
          report={state.weeklyReports[0]}
          previous={state.weeklyReports[1] ?? null}
          onContinue={() => update((s) => ({ ...s, weeklyReportSeen: true }))}
        />
      )}

      {addQuestOpen && canAddQuest && (
        <AddQuestModal
          category={tab}
          onClose={() => {
            setAddQuestOpen(false);
            setGoalPrefill(null);
          }}
          onCreate={addCustomQuest}
          initialTitle={goalPrefill?.title}
          initialStat={goalPrefill?.stat}
          initialReward={goalPrefill?.reward}
        />
      )}
    </div>
  );
}

// Full list — still used verbatim for the desktop/tablet pill row (which
// scrolls horizontally and isn't what anyone complained about being
// cramped). The mobile BottomNav below only surfaces the 4 busiest
// screens directly (home loop + food logging, both touched multiple times
// a day; achievements/streak, checked most sessions; the gold shop, the
// main sink for earned currency) and tucks the rarer ones — body stats and
// friends are typically set-and-check-occasionally, stats is a newer
// periodic-glance screen — behind a 5th "Ещё" button instead of forcing 7
// cramped tap targets into one row.
const NAV_TABS = [
  { to: "/", label: "Профиль", icon: HomeIcon },
  { to: "/nutrition", label: "Питание", icon: Utensils },
  { to: "/body", label: "Тело", icon: Activity },
  { to: "/friends", label: "Друзья", icon: Users },
  { to: "/achievements", label: "Достижения", icon: Trophy },
  { to: "/stats", label: "Статистика", icon: BarChart3 },
  { to: "/shop", label: "Магазин", icon: ShoppingBag },
] as const;

const PRIMARY_NAV_TABS = [
  { to: "/", label: "Профиль", icon: HomeIcon },
  { to: "/nutrition", label: "Питание", icon: Utensils },
  { to: "/achievements", label: "Достижения", icon: Trophy },
  { to: "/shop", label: "Магазин", icon: ShoppingBag },
] as const;

const MORE_NAV_TABS = [
  { to: "/stats", label: "Статистика", icon: BarChart3 },
  { to: "/body", label: "Тело", icon: Activity },
  { to: "/friends", label: "Друзья", icon: Users },
] as const;

export function TabNav({ pathname }: { pathname: string }) {
  // Read directly from context rather than threading a prop through all six
  // route files that render TabNav — simplest way to surface a Supabase
  // sync failure in one shared place.
  const { syncError } = useGameStateContext();

  return (
    <>
      {syncError && (
        <div
          role="status"
          className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          Не удалось синхронизироваться с сервером — показаны последние сохранённые локально данные.
          Проверь соединение с интернетом.
        </div>
      )}
      <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
        {/* Desktop/tablet: horizontal pill tabs, unchanged. Hidden below md
            — the fixed BottomNav takes over navigation on narrow screens
            instead (see below). */}
        <div className="hidden min-w-0 flex-1 overflow-x-auto md:block">
          <div className="inline-flex w-max rounded-full border border-border bg-secondary p-1">
            {NAV_TABS.map((t) => {
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
        {/* Mobile: the pill row above is hidden, so this label fills its
            place — otherwise the header would be just Settings/theme
            icons floating on the right with nothing on the left. */}
        <div className="min-w-0 flex-1 text-sm font-medium text-primary md:hidden">Life RPG</div>

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

      <BottomNav pathname={pathname} />
    </>
  );
}

/**
 * Fixed bottom tab bar, mobile-only (hidden at md and above — the pill row
 * in TabNav takes over there instead). Standard mobile-app pattern: icon +
 * label per section, active section highlighted.
 *
 * Doesn't fight with other bottom-anchored UI:
 * - Every page wrapper's `pb-28 md:pb-24` (see routes/*.tsx) already
 *   reserves room below the content so this bar never overlaps it.
 * - Full-screen modals (AddQuestModal, FriendProfileModal, etc.) use
 *   z-[200], well above this bar's z-40, so they cover it completely
 *   while open rather than clipping behind it.
 * - UndoToast sits higher on mobile specifically (bottom-20 md:bottom-4)
 *   so its "Отменить" toast floats above this bar instead of behind it.
 */
function BottomNav({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_NAV_TABS.some((t) => t.to === pathname);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-4xl items-stretch justify-around">
          {PRIMARY_NAV_TABS.map((t) => {
            const active = pathname === t.to;
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                onClick={() => setMoreOpen(false)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span>{t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-label="Ещё разделы"
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              moreActive || moreOpen ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <MoreHorizontal size={20} strokeWidth={moreActive || moreOpen ? 2.5 : 2} />
            <span>Ещё</span>
          </button>
        </div>
      </nav>

      {moreOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[200] md:hidden">
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setMoreOpen(false)}
                // Was bg-background/60 + backdrop-blur-sm — dark enough
                // (plus the blur on top) that the screen underneath was
                // barely legible while the sheet was open. Chosen variant 1
                // from the preview set: a much lighter scrim, no blur, so
                // the content behind stays readable; the sheet itself
                // (shadow-lg + its own bg-card fill) still reads clearly
                // separated from it.
                className="absolute inset-0 bg-background/20"
              />
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-4 shadow-lg"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold">Ещё разделы</span>
                  <button
                    type="button"
                    onClick={() => setMoreOpen(false)}
                    aria-label="Закрыть"
                    className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MORE_NAV_TABS.map((t) => {
                    const active = pathname === t.to;
                    const Icon = t.icon;
                    return (
                      <Link
                        key={t.to}
                        to={t.to}
                        onClick={() => setMoreOpen(false)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-colors ${
                          active
                            ? "border-primary/40 bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:bg-secondary"
                        }`}
                      >
                        <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                        <span>{t.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
