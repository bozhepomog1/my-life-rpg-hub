import {
  computeNutritionGoals,
  isDayFullyDone,
  todayKey,
  xpForNextLevel,
  type ActiveMarathon,
  type GameState,
  type MarathonHistoryEntry,
  type MarathonKind,
  type QuestCategory,
  type StatKey,
} from "@/lib/game";
import { NUTRITION_GOALS } from "@/lib/nutrition";

export interface MarathonTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  kind: MarathonKind;
  category?: QuestCategory; // for kind "category"
  stat?: StatKey; // for kind "stat"
  days: number;
  goldReward: number;
  xpReward: number;
}

// Reward scaled well above a typical single quest/boss-quest reward — a
// marathon is a multi-week commitment, so the payoff at the end should
// clearly read as "boosted", per spec.
function rewardFor(days: number) {
  return { goldReward: days * 15, xpReward: days * 12 };
}

export const MARATHON_TEMPLATES: MarathonTemplate[] = [
  {
    id: "discipline_14",
    title: "14 дней дисциплины",
    description: "Закрывай ВСЕ ежедневные квесты 14 дней подряд.",
    icon: "🗓️",
    kind: "category",
    category: "daily",
    days: 14,
    ...rewardFor(14),
  },
  {
    id: "strength_21",
    title: "21 день физической активности",
    description: "Заверши хотя бы один силовой квест каждый день, 21 день подряд.",
    icon: "💪",
    kind: "stat",
    stat: "strength",
    days: 21,
    ...rewardFor(21),
  },
  {
    id: "nutrition_30",
    title: "30 дней питания по плану",
    description: "Держи калории в пределах своей цели 30 дней подряд.",
    icon: "🥗",
    kind: "nutrition_goal",
    days: 30,
    ...rewardFor(30),
  },
  {
    id: "intellect_10",
    title: "10 дней разума",
    description: "Заверши хотя бы один квест на интеллект каждый день, 10 дней подряд.",
    icon: "🧠",
    kind: "stat",
    stat: "intellect",
    days: 10,
    ...rewardFor(10),
  },
  {
    id: "will_14",
    title: "14 дней воли",
    description: "Заверши хотя бы один квест на волю каждый день, 14 дней подряд.",
    icon: "🛡️",
    kind: "stat",
    stat: "will",
    days: 14,
    ...rewardFor(14),
  },
  {
    id: "appearance_7",
    title: "7 дней стиля",
    description: "Заверши хотя бы один квест на внешность каждый день, 7 дней подряд.",
    icon: "💎",
    kind: "stat",
    stat: "appearance",
    days: 7,
    ...rewardFor(7),
  },
];

export function marathonById(id: string): MarathonTemplate | undefined {
  return MARATHON_TEMPLATES.find((t) => t.id === id);
}

/** Starts a fresh marathon — a no-op if one is already running (finished
 * marathons don't block a new pick; only an in-progress one does, per spec
 * "можно вести только один одновременно"). */
export function startMarathon(state: GameState, templateId: string): GameState {
  if (state.activeMarathon && !state.activeMarathon.completed) return state;
  if (!marathonById(templateId)) return state;
  return {
    ...state,
    activeMarathon: {
      templateId,
      startedDateKey: todayKey(),
      progressDays: 0,
      lastCreditedDateKey: null,
      completed: false,
    },
  };
}

/** Gives up on the current marathon entirely (distinct from a missed day,
 * which only resets progress to 0 but keeps the same marathon selected). */
export function abandonMarathon(state: GameState): GameState {
  return { ...state, activeMarathon: null };
}

function nextDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return todayKey(new Date(y, m - 1, d + 1));
}

/**
 * Whether the marathon's daily condition was met on a given (past) date.
 * "category"/"daily" reuses the discipline calendar's own all-dailies-done
 * check; "category"/story|purchase and "stat" scan completedAt timestamps
 * for a matching quest that day — daily quests specifically are matched via
 * dailyCompletions (the durable per-day id list) against the CURRENT quests
 * array to recover their stat, since a daily quest's own completedAt doesn't
 * survive its next reset. That's an approximation for quests deleted since
 * (same judgment call as computeNutritionStreak's "apply today's goal
 * historically" in nutrition.ts) — acceptable given the rollover normally
 * runs within a day or two of the date it's evaluating, not months later.
 */
function marathonDayMet(state: GameState, template: MarathonTemplate, dateKey: string): boolean {
  if (template.kind === "category") {
    if (template.category === "daily") return isDayFullyDone(state, dateKey);
    return state.quests.some(
      (q) =>
        q.category === template.category &&
        q.done &&
        q.completedAt != null &&
        todayKey(new Date(q.completedAt)) === dateKey,
    );
  }
  if (template.kind === "stat") {
    const dailyIds = state.dailyCompletions[dateKey] ?? [];
    const dailyMatch = dailyIds.some(
      (id) => state.quests.find((q) => q.id === id)?.stat === template.stat,
    );
    if (dailyMatch) return true;
    const completedThatDay = (q: { stat: StatKey; done: boolean; completedAt?: number }) =>
      q.stat === template.stat &&
      q.done &&
      q.completedAt != null &&
      todayKey(new Date(q.completedAt)) === dateKey;
    return state.quests.some(completedThatDay) || state.bonusQuests.some(completedThatDay);
  }
  // nutrition_goal — same "compare against today's goal" simplification as
  // computeNutritionStreak(), since goals aren't stored historically.
  const day = state.nutrition[dateKey];
  if (!day || day.entries.length === 0) return false;
  const goals =
    state.body.nutritionOverride ?? computeNutritionGoals(state.body) ?? NUTRITION_GOALS;
  return day.kcal <= goals.kcal;
}

// Caps how many missed days the rollover will individually walk through
// before just conservatively snapping progress to 0 — a user reopening the
// app after a multi-month absence shouldn't force a slow day-by-day replay.
const MAX_ROLLOVER_DAYS = 60;

/**
 * Advances the active marathon's progress by crediting (or resetting) every
 * fully-elapsed day since it was last checked. Today itself is never
 * evaluated — it's still in progress. Auto-grants the boosted XP/gold reward
 * and logs a permanent history entry the moment progressDays reaches the
 * template's target. Safe to call on every tick of the periodic effect in
 * index.tsx, same as ensureWeekRollover/ensureBossQuest.
 */
export function ensureMarathonRollover(state: GameState): GameState {
  const m = state.activeMarathon;
  if (!m || m.completed) return state;
  const template = marathonById(m.templateId);
  if (!template) return { ...state, activeMarathon: null }; // stale/unknown id — clear defensively

  const today = todayKey();
  let checkDate = m.lastCreditedDateKey ? nextDateKey(m.lastCreditedDateKey) : m.startedDateKey;
  if (checkDate >= today) return state; // nothing fully elapsed to evaluate yet

  let progressDays = m.progressDays;
  let lastCredited = m.lastCreditedDateKey;
  let iterations = 0;
  while (checkDate < today && iterations < MAX_ROLLOVER_DAYS) {
    progressDays = marathonDayMet(state, template, checkDate) ? progressDays + 1 : 0;
    lastCredited = checkDate;
    checkDate = nextDateKey(checkDate);
    iterations += 1;
  }
  if (iterations >= MAX_ROLLOVER_DAYS) {
    progressDays = 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    lastCredited = todayKey(yesterday);
  }

  const completed = progressDays >= template.days;
  const next: GameState = {
    ...state,
    activeMarathon: {
      ...m,
      progressDays: Math.min(progressDays, template.days),
      lastCreditedDateKey: lastCredited,
      completed,
    },
  };
  if (!completed) return next;

  next.totalXp += template.xpReward;
  while (next.totalXp >= xpForNextLevel(next.level)) next.level += 1;
  next.gold += template.goldReward;
  const entry: MarathonHistoryEntry = {
    templateId: template.id,
    title: template.title,
    completedAt: Date.now(),
  };
  next.marathonHistory = [entry, ...next.marathonHistory];
  return next;
}
