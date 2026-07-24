import { computeDiscipline, STAT_META, type GameState, type StatKey } from "./game";

export type AchievementCategory =
  | "streak"
  | "level"
  | "stats"
  | "social"
  | "nutrition"
  | "quests"
  | "special";

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  streak: "Серии",
  level: "Уровень",
  stats: "Характеристики",
  social: "Социальное",
  nutrition: "Питание",
  quests: "Квесты",
  special: "Особые",
};

export const ACHIEVEMENT_CATEGORY_ORDER: AchievementCategory[] = [
  "streak",
  "level",
  "stats",
  "social",
  "nutrition",
  "quests",
  "special",
];

/**
 * Extra data achievements may need that doesn't live in GameState itself
 * (friends/leaderboard come from Supabase, fetched only on the Friends
 * page). Callers that don't have this data simply omit it — the social
 * achievements just won't unlock from that particular check, and will pick
 * up next time a caller that does have the data runs the check. Achievement
 * ids are never removed once unlocked, so partial/missing context is always
 * safe, never destructive.
 */
export interface AchievementContext {
  friendsCount: number;
  leaderboardTop3: boolean;
}

export interface AchievementProgress {
  current: number;
  target: number;
}

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  icon: string;
  title: string;
  /** Shown as the unlock condition while locked. */
  description: string;
  progress?: (state: GameState, ctx: AchievementContext) => AchievementProgress | null;
  unlocked: (state: GameState, ctx: AchievementContext) => boolean;
}

function totalNutritionEntries(state: GameState): number {
  return Object.values(state.nutrition).reduce((sum, d) => sum + d.entries.length, 0);
}

function statAchievement(stat: StatKey, icon: string, title: string): AchievementDef {
  return {
    id: `stat_${stat}_10`,
    category: "stats",
    icon,
    title,
    description: `Прокачай «${STAT_META[stat].label}» до 10 уровня`,
    progress: (state) => ({ current: Math.min(10, state.stats[stat].level), target: 10 }),
    unlocked: (state) => state.stats[stat].level >= 10,
  };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Серии ──
  {
    id: "streak_7",
    category: "streak",
    icon: "🔥",
    title: "Неделя дисциплины",
    description: "Сделай серию 7 дней подряд",
    progress: (state) => ({ current: Math.min(7, state.longestStreak), target: 7 }),
    unlocked: (state) => state.longestStreak >= 7,
  },
  {
    id: "streak_30",
    category: "streak",
    icon: "🔥",
    title: "Месяц без права на слабость",
    description: "Сделай серию 30 дней подряд",
    progress: (state) => ({ current: Math.min(30, state.longestStreak), target: 30 }),
    unlocked: (state) => state.longestStreak >= 30,
  },
  {
    id: "streak_100",
    category: "streak",
    icon: "🔥",
    title: "Стальная воля",
    description: "Сделай серию 100 дней подряд",
    progress: (state) => ({ current: Math.min(100, state.longestStreak), target: 100 }),
    unlocked: (state) => state.longestStreak >= 100,
  },

  // ── Уровень ──
  {
    id: "level_5",
    category: "level",
    icon: "⭐",
    title: "Разгон",
    description: "Достигни 5 уровня героя",
    progress: (state) => ({ current: Math.min(5, state.level), target: 5 }),
    unlocked: (state) => state.level >= 5,
  },
  {
    id: "level_10",
    category: "level",
    icon: "🌟",
    title: "Уверенный герой",
    description: "Достигни 10 уровня героя",
    progress: (state) => ({ current: Math.min(10, state.level), target: 10 }),
    unlocked: (state) => state.level >= 10,
  },
  {
    id: "level_20",
    category: "level",
    icon: "💫",
    title: "Легенда",
    description: "Достигни 20 уровня героя",
    progress: (state) => ({ current: Math.min(20, state.level), target: 20 }),
    unlocked: (state) => state.level >= 20,
  },

  // ── Характеристики ──
  statAchievement("strength", "⚔️", "Силач"),
  statAchievement("intellect", "🧠", "Мудрец"),
  statAchievement("will", "🛡️", "Стоик"),
  statAchievement("appearance", "💎", "Икона стиля"),

  // ── Социальное ──
  {
    id: "social_first_friend",
    category: "social",
    icon: "🤝",
    title: "Не один в поле",
    description: "Добавь первого друга",
    unlocked: (_state, ctx) => ctx.friendsCount >= 1,
  },
  {
    id: "social_top3",
    category: "social",
    icon: "🏆",
    title: "Пьедестал",
    description: "Попади в топ-3 таблицы рейтингов среди друзей",
    unlocked: (_state, ctx) => ctx.leaderboardTop3,
  },

  // ── Питание ──
  {
    id: "nutrition_10",
    category: "nutrition",
    icon: "🍎",
    title: "Веду учёт",
    description: "Сделай 10 записей в БЖУ-трекере",
    progress: (state) => ({ current: Math.min(10, totalNutritionEntries(state)), target: 10 }),
    unlocked: (state) => totalNutritionEntries(state) >= 10,
  },
  {
    id: "nutrition_50",
    category: "nutrition",
    icon: "🍽️",
    title: "Дисциплина в тарелке",
    description: "Сделай 50 записей в БЖУ-трекере",
    progress: (state) => ({ current: Math.min(50, totalNutritionEntries(state)), target: 50 }),
    unlocked: (state) => totalNutritionEntries(state) >= 50,
  },

  // ── Квесты ──
  {
    id: "quests_1",
    category: "quests",
    icon: "✅",
    title: "Первый шаг",
    description: "Выполни свой первый квест",
    progress: (state) => ({ current: Math.min(1, state.completedCount), target: 1 }),
    unlocked: (state) => state.completedCount >= 1,
  },
  {
    id: "quests_50",
    category: "quests",
    icon: "📋",
    title: "Полтинник",
    description: "Выполни 50 квестов всего",
    progress: (state) => ({ current: Math.min(50, state.completedCount), target: 50 }),
    unlocked: (state) => state.completedCount >= 50,
  },
  {
    id: "quests_100",
    category: "quests",
    icon: "💯",
    title: "Сотня",
    description: "Выполни 100 квестов всего",
    progress: (state) => ({ current: Math.min(100, state.completedCount), target: 100 }),
    unlocked: (state) => state.completedCount >= 100,
  },
  {
    id: "quests_365",
    category: "quests",
    icon: "🗓️",
    title: "Год усилий",
    description: "Выполни 365 квестов всего",
    progress: (state) => ({ current: Math.min(365, state.completedCount), target: 365 }),
    unlocked: (state) => state.completedCount >= 365,
  },

  // ── Особые ──
  {
    id: "deposit_won",
    category: "special",
    icon: "💰",
    title: "Залог отбит",
    description: "Успешно выполни условия 30-дневного залога",
    unlocked: (state) => {
      const d = computeDiscipline(state);
      return d.finished && !d.lost;
    },
  },
];

export interface AchievementResult {
  def: AchievementDef;
  unlocked: boolean;
  progress: AchievementProgress | null;
}

export function evalAchievements(
  state: GameState,
  ctx: Partial<AchievementContext> = {},
): AchievementResult[] {
  const fullCtx: AchievementContext = {
    friendsCount: ctx.friendsCount ?? 0,
    leaderboardTop3: ctx.leaderboardTop3 ?? false,
  };
  return ACHIEVEMENTS.map((def) => ({
    def,
    unlocked: def.unlocked(state, fullCtx),
    progress: def.progress ? def.progress(state, fullCtx) : null,
  }));
}

/**
 * Unlocks any newly-met achievements (never re-locks a previously earned
 * one, even if context is missing this time). Returns the same state
 * reference when nothing changed, so callers can cheaply skip re-renders.
 */
export function applyAchievementUnlocks(
  state: GameState,
  ctx: Partial<AchievementContext> = {},
): GameState {
  const results = evalAchievements(state, ctx);
  let changed = false;
  const unlockedAchievements = { ...state.unlockedAchievements };
  for (const r of results) {
    if (r.unlocked && !unlockedAchievements[r.def.id]) {
      unlockedAchievements[r.def.id] = Date.now();
      changed = true;
    }
  }
  if (!changed) return state;
  return { ...state, unlockedAchievements };
}
