import {
  computeDiscipline,
  isDayFullyDone,
  todayKey,
  STAT_META,
  type GameState,
  type StatKey,
} from "./game";

export type AchievementCategory =
  | "streak"
  | "level"
  | "stats"
  | "social"
  | "nutrition"
  | "quests"
  | "special"
  | "secret";

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  streak: "Серии",
  level: "Уровень",
  stats: "Характеристики",
  social: "Социальное",
  nutrition: "Питание",
  quests: "Квесты",
  special: "Особые",
  secret: "Скрытые",
};

export const ACHIEVEMENT_CATEGORY_ORDER: AchievementCategory[] = [
  "streak",
  "level",
  "stats",
  "social",
  "nutrition",
  "quests",
  "special",
  "secret",
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
  /** Hidden achievement — neither `title`, `icon`, `description` nor any
   * progress bar is shown while locked (achievements.tsx renders a "???"
   * silhouette instead). Once unlocked it's revealed and celebrated exactly
   * like any other achievement (see AchievementWatcher.tsx, which doesn't
   * need to know about this flag at all — it already looks up title/icon by
   * id after the fact). */
  secret?: boolean;
}

function totalNutritionEntries(state: GameState): number {
  return Object.values(state.nutrition).reduce((sum, d) => sum + d.entries.length, 0);
}

// ── Helpers for secret achievements — each one is a self-contained,
// surprising/one-off condition, so they don't share the tidy "progress
// toward N" shape most visible achievements have. All computed purely from
// existing GameState (plus the two small dedicated flags added for
// midnight/undo, which leave no other trace).

/** First calendar week since the discipline-calendar anchor date, with zero
 * missed days — deliberately checks the very START of a user's history, not
 * just "any" 7-day stretch (that's what streak_7 already covers). */
function firstWeekPerfect(state: GameState): boolean {
  const days = computeDiscipline(state).days.slice(0, 7);
  return days.length === 7 && days.every((d) => d.status === "green");
}

/** 5 or more quest completions (any category, including bonus quests)
 * within any rolling 60-minute window. */
function hasSpeedrun(state: GameState): boolean {
  const timestamps = [...state.quests, ...state.bonusQuests]
    .map((q) => q.completedAt)
    .filter((t): t is number => t != null)
    .sort((a, b) => a - b);
  const HOUR = 60 * 60 * 1000;
  for (let i = 0; i + 4 < timestamps.length; i++) {
    if (timestamps[i + 4] - timestamps[i] <= HOUR) return true;
  }
  return false;
}

/** A single calendar day where the daily checklist was 100% done AND at
 * least one story quest AND one purchase quest were also completed. */
function hasPerfectAllCategoriesDay(state: GameState): boolean {
  const storyDays = new Set(
    state.quests
      .filter((q) => q.category === "story" && q.done && q.completedAt != null)
      .map((q) => todayKey(new Date(q.completedAt as number))),
  );
  const purchaseDays = new Set(
    state.quests
      .filter((q) => q.category === "purchase" && q.done && q.completedAt != null)
      .map((q) => todayKey(new Date(q.completedAt as number))),
  );
  for (const dateKey of Object.keys(state.dailyCompletions)) {
    if (!storyDays.has(dateKey) || !purchaseDays.has(dateKey)) continue;
    if (isDayFullyDone(state, dateKey)) return true;
  }
  return false;
}

/** Three boss-quest wins on three consecutive Mondays (weekKey 7 days apart
 * each time) — a "boss marathon", tying two systems together. */
function hasBossWinStreak3(state: GameState): boolean {
  const weeks = [...new Set(state.bossWins.map((w) => w.weekKey))].sort();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  for (let i = 0; i + 2 < weeks.length; i++) {
    const [y1, m1, d1] = weeks[i].split("-").map(Number);
    const [y2, m2, d2] = weeks[i + 1].split("-").map(Number);
    const [y3, m3, d3] = weeks[i + 2].split("-").map(Number);
    const t1 = new Date(y1, m1 - 1, d1).getTime();
    const t2 = new Date(y2, m2 - 1, d2).getTime();
    const t3 = new Date(y3, m3 - 1, d3).getTime();
    if (t2 - t1 === WEEK_MS && t3 - t2 === WEEK_MS) return true;
  }
  return false;
}

function totalPostpones(state: GameState): number {
  return Object.values(state.postponesUsed).reduce((sum, n) => sum + n, 0);
}

function totalCheatMeals(state: GameState): number {
  return Object.values(state.cheatMealsUsed).reduce((sum, n) => sum + n, 0);
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
    description: "Настрой залог в Настройках и успешно выполни его условия до конца срока",
    unlocked: (state) => {
      const d = computeDiscipline(state);
      return d.finished && !d.lost;
    },
  },

  // ── Скрытые (secret: true) — не показываются заранее, см. AchievementDef.secret ──
  {
    id: "secret_midnight",
    category: "secret",
    secret: true,
    icon: "🌙",
    title: "Полуночный герой",
    description: "Заверши квест ровно в полночь (00:00–00:04)",
    unlocked: (state) => state.midnightQuestDone,
  },
  {
    id: "secret_first_week_perfect",
    category: "secret",
    secret: true,
    icon: "🌱",
    title: "С самого начала",
    description: "Не пропусти ни одного дня за самую первую неделю своего пути",
    unlocked: (state) => firstWeekPerfect(state),
  },
  {
    id: "secret_speedrun",
    category: "secret",
    secret: true,
    icon: "⚡",
    title: "Марш-бросок",
    description: "Заверши 5 квестов в течение одного часа",
    unlocked: (state) => hasSpeedrun(state),
  },
  {
    id: "secret_perfect_all_categories",
    category: "secret",
    secret: true,
    icon: "🌈",
    title: "Идеальный день",
    description:
      "В один день закрой ежедневные квесты на 100% И заверши хотя бы один сюжетный, и один закупочный квест",
    unlocked: (state) => hasPerfectAllCategoriesDay(state),
  },
  {
    id: "secret_not_giving_up",
    category: "secret",
    secret: true,
    icon: "🕊️",
    title: "Не сдаюсь",
    description: "Проиграй залог, но всё равно позже дойди до серии 7 дней подряд",
    unlocked: (state) => state.depositLost && state.longestStreak >= 7,
  },
  {
    id: "secret_postpone_master",
    category: "secret",
    secret: true,
    icon: "⏳",
    title: "Мастер отсрочки",
    description: 'Воспользуйся "Отложить квест" в сумме 5 раз',
    unlocked: (state) => totalPostpones(state) >= 5,
  },
  {
    id: "secret_cheat_rebel",
    category: "secret",
    secret: true,
    icon: "🍩",
    title: "Осознанный бунтарь",
    description: "Используй читмил хотя бы раз",
    unlocked: (state) => totalCheatMeals(state) >= 1,
  },
  {
    id: "secret_boss_marathon",
    category: "secret",
    secret: true,
    icon: "🐉",
    title: "Босс-марафон",
    description: "Победи босс-квест недели 3 недели подряд без единого пропуска",
    unlocked: (state) => hasBossWinStreak3(state),
  },
  {
    id: "secret_photo_proof",
    category: "secret",
    secret: true,
    icon: "📸",
    title: "Визуальное доказательство",
    description: "Прикрепи фото минимум к 3 квестам одновременно",
    unlocked: (state) => state.quests.filter((q) => q.photoPath).length >= 3,
  },
  {
    id: "secret_checklist_champion",
    category: "secret",
    secret: true,
    icon: "✅",
    title: "Чек-лист чемпион",
    description: "Заверши квест с чеклистом из 5+ пунктов, полностью отмеченным",
    unlocked: (state) =>
      state.quests.some(
        (q) => q.done && q.checklist && q.checklist.length >= 5 && q.checklist.every((c) => c.done),
      ),
  },
  {
    id: "secret_fashionista",
    category: "secret",
    secret: true,
    icon: "👑",
    title: "Модник",
    description: "Экипируй одновременно рамку, титул и тему карточки (не стандартную)",
    unlocked: (state) =>
      !!state.equippedFrame && !!state.equippedTitle && state.equippedCardTheme !== "classic",
  },
  {
    id: "secret_undo_used",
    category: "secret",
    secret: true,
    icon: "😅",
    title: "Ты серьёзно?",
    description: 'Воспользуйся отменой ("Отменить") хотя бы раз',
    unlocked: (state) => state.everUsedUndo,
  },
  {
    id: "secret_marathon_finisher",
    category: "secret",
    secret: true,
    icon: "🏁",
    title: "Марафонец",
    description: "Заверши свой первый марафон",
    unlocked: (state) => state.marathonHistory.length >= 1,
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
