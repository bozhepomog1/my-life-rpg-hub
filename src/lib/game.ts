import {
  DEFAULT_ACCENT_COLORS,
  DEFAULT_BACKGROUND,
  DEFAULT_CARD_COLOR,
  type AccentColors,
  type BackgroundSettings,
  type CardColorSettings,
} from "@/lib/personalization";

export type StatKey = "strength" | "intellect" | "will" | "appearance";
export type QuestCategory = "daily" | "story" | "purchase";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Quest {
  id: string;
  title: string;
  stat: StatKey;
  reward: number;
  category: QuestCategory;
  requiresPhoto?: boolean;
  photoHint?: string;
  photoPath?: string; // path within the "quest-photos" Storage bucket (private; resolve via signed URL)
  requiresText?: boolean; // needs a short written note before it can be completed
  proofNote?: string;
  done: boolean;
  mandatory?: boolean; // for daily → discipline calendar
  checklist?: ChecklistItem[];
  createdAt: number;
  completedAt?: number;
  lastResetDate?: string; // for daily quests, ISO date
  deadline?: number;
  // Bodyweight training quests: when set, the quest's hint is personalized
  // with a target rep count based on the matching personal record (once
  // one's been entered in "Тело"); otherwise it falls back to
  // trainingDefaultHint.
  linkedRecord?: RecordKey;
  recordPercent?: number; // e.g. 0.7 for "70% of your max"
  trainingDefaultHint?: string;
  // Work/Day-off mode (see WORK_MODE below): when workMode is on, a daily
  // quest with these set shows the lightened title/reward instead of the
  // full one. dayOffOnly quests are hidden entirely while at work — reserved
  // for genuinely heavy tasks (full workouts, extensive learning sessions).
  workModeTitle?: string;
  workModeReward?: number;
  dayOffOnly?: boolean;
  // Bonus quests: drawn from BONUS_QUEST_POOL when no daily quests remain
  // today, rewarded at 1.5x. Purely a display flag (badge).
  bonus?: boolean;
}

export interface StatState {
  level: number;
  xp: number;
}

export interface Macro {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface NutritionEntry extends Macro {
  text: string;
  at: number;
}

export interface NutritionDay extends Macro {
  entries: NutritionEntry[];
  // Set for a day when a monthly "cheat meal" reward was used — temporarily
  // lowers the remaining carb/fat goals, but the day still counts as green.
  cheatMealUsed?: boolean;
}

export type RecordKey = "maxPushups" | "maxPullups" | "maxDips" | "maxLegRaises";

export const RECORD_META: Record<RecordKey, { label: string; unit: string }> = {
  maxPushups: { label: "Отжимания от пола (макс. за подход)", unit: "раз" },
  maxPullups: { label: "Подтягивания (макс. за подход)", unit: "раз" },
  maxDips: { label: "Отжимания на брусьях (макс. за подход)", unit: "раз" },
  maxLegRaises: { label: "Подъёмы ног на пресс (макс. за подход)", unit: "раз" },
};

export type Sex = "male" | "female";
export type NutritionGoal = "lose" | "maintain" | "gain";

export interface BodyStats {
  heightCm?: number;
  weightKg?: number;
  maxPushups?: number;
  maxPullups?: number;
  maxDips?: number;
  maxLegRaises?: number;
  // Used only for the Mifflin-St Jeor nutrition goal calculation below.
  age?: number;
  sex?: Sex;
  goal?: NutritionGoal;
  // When set, these values are used as the nutrition goals instead of the
  // calculated ones — an explicit manual override for anyone who disagrees
  // with the formula's numbers. Clearing it (setting back to undefined)
  // reverts to auto-calculation.
  nutritionOverride?: Macro;
}

export const NUTRITION_GOAL_LABELS: Record<NutritionGoal, string> = {
  lose: "Похудение",
  maintain: "Поддержание веса",
  gain: "Набор массы",
};

/**
 * Fixed activity multiplier used for the Mifflin-St Jeor calculation below.
 * The request only asked for height/weight/age/sex/goal as inputs — no
 * separate "activity level" field — so this uses "lightly active" (light
 * exercise 1-3 days/week), a reasonable middle-of-the-road default given
 * the app already tracks some exercise via quests. Documented here rather
 * than silently baked in, since it's the one part of the standard formula
 * this app doesn't collect a dedicated input for.
 */
export const NUTRITION_ACTIVITY_FACTOR = 1.375;

/** kcal deficit/surplus applied on top of maintenance TDEE, per goal. */
const GOAL_KCAL_ADJUSTMENT: Record<NutritionGoal, number> = {
  lose: -500,
  maintain: 0,
  gain: 400,
};

/** Grams of protein per kg of bodyweight, per goal (higher to preserve muscle in a deficit). */
const GOAL_PROTEIN_PER_KG: Record<NutritionGoal, number> = {
  lose: 2.0,
  maintain: 1.6,
  gain: 1.8,
};

const MIN_DAILY_KCAL = 1200;

/**
 * Mifflin-St Jeor BMR × activity factor, adjusted for the stated goal, then
 * split into macros: protein by bodyweight (goal-dependent), fat at 25% of
 * total calories, carbs filling the remainder. Returns null until height,
 * weight, age, sex, and goal are all filled in — this is a standard
 * fitness-app formula, computed entirely client-side (no external calls).
 */
export function computeNutritionGoals(body: BodyStats): Macro | null {
  const { heightCm, weightKg, age, sex, goal } = body;
  if (!heightCm || !weightKg || !age || !sex || !goal) return null;

  const bmr =
    sex === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  const tdee = bmr * NUTRITION_ACTIVITY_FACTOR;
  const kcal = Math.max(MIN_DAILY_KCAL, Math.round(tdee + GOAL_KCAL_ADJUSTMENT[goal]));

  const protein = Math.round(weightKg * GOAL_PROTEIN_PER_KG[goal]);
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return { kcal, protein, fat, carbs };
}

/** Rep count treated as a "100%, advanced-level" reference for each record. */
export const FITNESS_BENCHMARKS: Record<RecordKey, number> = {
  maxPushups: 40,
  maxPullups: 15,
  maxDips: 20,
  maxLegRaises: 30,
};

export interface FitnessLevel {
  label: string;
  min: number;
}

export const FITNESS_LEVELS: FitnessLevel[] = [
  { label: "Новичок", min: 0 },
  { label: "Любитель", min: 25 },
  { label: "Продвинутый", min: 50 },
  { label: "Атлет", min: 75 },
];

/**
 * 0-100 index averaging all 4 records, each normalized against its
 * benchmark (capped at 100% so one very strong lift can't drag the
 * average over 100). Requires all 4 records to be set — averaging over
 * only the ones that are filled in would show a misleadingly high index
 * from partial data (e.g. only pushups entered, at "Атлет" level).
 */
export function computeFitnessIndex(body: BodyStats): number | null {
  const keys = Object.keys(FITNESS_BENCHMARKS) as RecordKey[];
  if (!keys.every((k) => body[k] != null)) return null;
  const pct =
    keys.reduce((sum, k) => {
      const value = body[k] as number;
      return sum + Math.min(100, (value / FITNESS_BENCHMARKS[k]) * 100);
    }, 0) / keys.length;
  return Math.round(pct);
}

export function fitnessLevelLabel(index: number): string {
  const level = [...FITNESS_LEVELS].reverse().find((l) => index >= l.min);
  return level?.label ?? FITNESS_LEVELS[0].label;
}

export interface GameState {
  avatar: string;
  name: string;
  totalXp: number;
  level: number;
  stats: Record<StatKey, StatState>;
  quests: Quest[];
  completedCount: number;
  // deposit
  depositStartAt: number; // timestamp; 30 days countdown starts
  depositAmount: number; // e.g. 1000
  depositLost: boolean;
  // discipline: dates → list of completed daily quest ids that day
  dailyCompletions: Record<string, string[]>;
  // nutrition: date → that day's logged calories/macros
  nutrition: Record<string, NutritionDay>;
  // body: height/weight + personal training records
  body: BodyStats;
  // longest streak of consecutive fully-completed days ever reached
  longestStreak: number;
  // Work schedule: replaces the old binary work/day-off toggle. Whether
  // "today" counts as a work day is derived from this via isWorkDayToday()
  // rather than stored directly, so it stays correct automatically as days
  // pass — see WorkSchedule below.
  schedule: WorkSchedule;
  // Monthly cheat-meal reward counter, keyed by "YYYY-MM".
  cheatMealsUsed: Record<string, number>;
  // Today's randomly-drawn bonus quests (shown once no daily quests remain).
  bonusQuests: Quest[];
  bonusQuestsDate?: string;
  // Date the current daily-quest rotation (see DAILY_QUEST_POOL) was drawn
  // for. When this isn't today, ensureDailyRotation() swaps in a fresh
  // random subset from the pool.
  dailyQuestsDate?: string;
  // How many mandatory daily quests were assigned on a given date — needed
  // because rotated daily quests get fresh ids every day, so past days'
  // dailyCompletions can no longer be matched by id against "today's"
  // mandatory quest ids the way the original fixed quest list allowed.
  // Comparing counts instead of ids keeps the discipline calendar/streak
  // correct across rotations. Dates from before this feature existed simply
  // won't have an entry — callers fall back to the current mandatory count.
  dailyMandatoryCounts: Record<string, number>;
  // Unlocked achievement ids → the timestamp they were unlocked at. Once set,
  // an id is never removed (achievements don't "re-lock").
  unlockedAchievements: Record<string, number>;
  // Opt-in browser Notification reminders for unfinished daily quests.
  // Only ever set to true after the user explicitly grants permission.
  remindersEnabled: boolean;
  // Current 30-day season — a rolling XP/quest counter that resets every
  // season without touching overall hero level/XP. See SeasonState below.
  season: SeasonState;
  // Set once a season rolls over, so a results screen can be shown; cleared
  // (marked seen) once the player dismisses it, but the record itself is
  // kept around as the last completed season's summary.
  lastSeasonSummary?: SeasonSummary;
  seasonSummarySeen: boolean;
  // User's chosen accent colors (Settings → Персонализация). Optional so
  // states saved before this feature existed simply fall back to the
  // terracotta default wherever this is read — see DEFAULT_ACCENT_COLORS.
  accentColors: AccentColors;
  // User's chosen app background (Settings → Персонализация → Фон): a
  // neutral default, a solid tint, or an uploaded photo with a dimming
  // scrim. See BackgroundSettings for the shape.
  background: BackgroundSettings;
  // User's chosen card/panel surface color (Settings → Персонализация — фон
  // → Цвет карточек). See CardColorSettings for the shape.
  cardColor: CardColorSettings;
  // Manual fix-ups for PAST discipline-calendar days (e.g. forgot to log a
  // day but actually completed everything). Keyed by date (YYYY-MM-DD) →
  // forced status. Only ever consulted for days strictly before today — see
  // resolveDayStatus()/isDayFullyDone() — so this can never touch today's
  // live automatic tracking or be used to get ahead of the real rules.
  manualDayOverrides: Record<string, "green" | "red">;
}

const KEY = "rpg-life-state-v2";

/** Per-user local cache key, so multiple accounts on one browser don't collide. */
export function localCacheKey(userId: string) {
  return `${KEY}:${userId}`;
}

export const STAT_META: Record<StatKey, { label: string; color: string; icon: string }> = {
  strength: { label: "Сила", color: "#b8925a", icon: "⚔️" },
  intellect: { label: "Интеллект", color: "#5c8b99", icon: "🧠" },
  will: { label: "Воля", color: "#7a9471", icon: "🔥" },
  // Display label only — the StatKey stays "appearance" so existing saved
  // states (which key stats by this string) keep working after the rename.
  appearance: { label: "Харизма", color: "#9b7a96", icon: "💎" },
};

/**
 * The one fixed display order for characteristics across the whole app:
 * stat cards, quest lists/tags, anywhere stats are enumerated for a person
 * to read (as opposed to sorted by value, like the achievements leaderboard).
 * Defined once here instead of relying on object key insertion order, so it
 * can't silently drift if STAT_META/defaultState() are ever reordered later.
 */
export const STAT_ORDER: StatKey[] = ["strength", "intellect", "will", "appearance"];

/**
 * Sorts any list of stat-tagged items (quests, etc.) into STAT_ORDER groups,
 * preserving each item's relative order within its own stat group (stable
 * sort) — so daily quests no longer render in a random per-stat jumble.
 */
export function sortByStatOrder<T extends { stat: StatKey }>(items: T[]): T[] {
  return [...items].sort((a, b) => STAT_ORDER.indexOf(a.stat) - STAT_ORDER.indexOf(b.stat));
}

export const CATEGORY_META: Record<
  QuestCategory,
  { label: string; icon: string; description: string }
> = {
  daily: {
    label: "Ежедневные квесты",
    icon: "🌅",
    description: "Сброс в полночь. Требуют подтверждения.",
  },
  story: { label: "Сюжетные квесты", icon: "📜", description: "Крупные разовые цели с дедлайном." },
  purchase: { label: "Квесты-закупки", icon: "🛒", description: "Поиск, менеджмент, оптимизация." },
};

export const DEPOSIT_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** Minimum length of the written proof note for requiresText quests. */
export const MIN_NOTE_LENGTH = 25;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makeChecklist(items: string[]): ChecklistItem[] {
  return items.map((t) => ({ id: uid(), text: t, done: false }));
}

function seedQuests(): Quest[] {
  const now = Date.now();
  const q = (partial: Omit<Quest, "id" | "createdAt" | "done"> & { done?: boolean }): Quest => ({
    id: uid(),
    createdAt: now,
    done: false,
    ...partial,
  });

  return [
    // Daily quests are no longer seeded here — see DAILY_QUEST_POOL and
    // ensureDailyRotation() below, which draw a fresh random subset every
    // day. This function only seeds the one-off story/purchase quests.
    //
    // PRIVACY: everything in this function ships inside the public JS
    // bundle and is handed to EVERY new account. It must therefore stay
    // strictly generic — never put personal goals, purchases, order/SKU
    // numbers, place names or anything else identifying in here. Personal
    // quests belong in a user's own saved state (added from the UI), not
    // in the seed. See commit history: an earlier version of this seed
    // leaked the author's private quest list to every new signup.

    // STORY — generic one-off goals
    q({
      title: "Выйти на пробежку",
      stat: "strength",
      reward: 15,
      category: "story",
      requiresPhoto: true,
      photoHint: "Фото с улицы",
      dayOffOnly: true,
    }),
    q({
      title: "Начать учить иностранный язык",
      stat: "intellect",
      reward: 15,
      category: "story",
      requiresText: true,
      dayOffOnly: true,
    }),
    q({
      title: "Освоить новый навык или инструмент",
      stat: "intellect",
      reward: 20,
      category: "story",
      requiresText: true,
      dayOffOnly: true,
    }),
    q({
      title: "Приготовить новое блюдо с нуля",
      stat: "will",
      reward: 10,
      category: "story",
      requiresPhoto: true,
      photoHint: "Фото готового блюда",
    }),

    // STORY — bodyweight training, personalized once a record is set in "Тело"
    q({
      title: "Сделать подход отжиманий от пола",
      stat: "strength",
      reward: 10,
      category: "story",
      linkedRecord: "maxPushups",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
      dayOffOnly: true,
    }),
    q({
      title: "Сделать подход подтягиваний",
      stat: "strength",
      reward: 15,
      category: "story",
      linkedRecord: "maxPullups",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
      dayOffOnly: true,
    }),
    q({
      title: "Сделать подход отжиманий на брусьях",
      stat: "strength",
      reward: 15,
      category: "story",
      linkedRecord: "maxDips",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
      dayOffOnly: true,
    }),
    q({
      title: "Сделать подход подъёмов ног на пресс",
      stat: "strength",
      reward: 10,
      category: "story",
      linkedRecord: "maxLegRaises",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
      dayOffOnly: true,
    }),

    // PURCHASE — generic "manage / optimize / declutter" goals
    q({
      title: "Составить список трат за месяц и посчитать, сколько удалось отложить",
      stat: "will",
      reward: 15,
      category: "purchase",
    }),
    q({
      title: "Разобрать и почистить рабочее место и технику",
      stat: "strength",
      reward: 15,
      category: "purchase",
      requiresPhoto: true,
      photoHint: "Фото до/после",
    }),
    q({
      title: "Навести порядок в сохранённых ссылках и подписках",
      stat: "intellect",
      reward: 15,
      category: "purchase",
    }),
    q({
      title: "Разобрать гардероб и составить список того, что нужно обновить",
      stat: "appearance",
      reward: 10,
      category: "purchase",
      checklist: makeChecklist([
        "Разобрать шкаф",
        "Отложить то, что не носишь",
        "Составить список нужного",
      ]),
    }),
  ];
}

export function defaultState(): GameState {
  const base: GameState = {
    avatar: "🥷",
    name: "Герой",
    totalXp: 0,
    level: 1,
    stats: {
      strength: { level: 0, xp: 0 },
      intellect: { level: 0, xp: 0 },
      will: { level: 0, xp: 0 },
      appearance: { level: 0, xp: 0 },
    },
    quests: seedQuests(),
    completedCount: 0,
    depositStartAt: Date.now(),
    depositAmount: 1000,
    depositLost: false,
    dailyCompletions: {},
    nutrition: {},
    body: {},
    longestStreak: 0,
    schedule: defaultSchedule(),
    cheatMealsUsed: {},
    bonusQuests: [],
    dailyMandatoryCounts: {},
    unlockedAchievements: {},
    remindersEnabled: false,
    season: defaultSeason(),
    seasonSummarySeen: true,
    accentColors: { ...DEFAULT_ACCENT_COLORS },
    background: { ...DEFAULT_BACKGROUND },
    cardColor: { ...DEFAULT_CARD_COLOR },
    manualDayOverrides: {},
  };
  // Draw the first day's random daily-quest rotation immediately, so a
  // brand-new account isn't left with an empty daily list.
  return ensureDailyRotation(base);
}

/**
 * Reads cached game state from localStorage.
 * Pass a userId to read that user's cache; omit it to read the legacy
 * pre-auth anonymous cache (used only for one-time migration on first login).
 */
export function loadState(userId?: string): GameState | null {
  if (typeof window === "undefined") return null;
  try {
    const key = userId ? localCacheKey(userId) : KEY;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      stats: { ...base.stats, ...(parsed.stats || {}) },
      dailyCompletions: parsed.dailyCompletions || {},
      nutrition: parsed.nutrition || {},
      body: parsed.body || {},
      longestStreak: parsed.longestStreak ?? 0,
      // Migrates from the old binary workMode toggle: that boolean can't map
      // meaningfully onto a recurring schedule, so existing users just get a
      // fresh default (classic 5/2) schedule to configure in Settings.
      schedule: parsed.schedule || defaultSchedule(),
      cheatMealsUsed: parsed.cheatMealsUsed || {},
      bonusQuests: parsed.bonusQuests || [],
      bonusQuestsDate: parsed.bonusQuestsDate,
      dailyQuestsDate: parsed.dailyQuestsDate,
      dailyMandatoryCounts: parsed.dailyMandatoryCounts || {},
      unlockedAchievements: parsed.unlockedAchievements || {},
      remindersEnabled: parsed.remindersEnabled ?? false,
      season: parsed.season || defaultSeason(),
      lastSeasonSummary: parsed.lastSeasonSummary,
      seasonSummarySeen: parsed.seasonSummarySeen ?? true,
      accentColors: parsed.accentColors || { ...DEFAULT_ACCENT_COLORS },
      background: parsed.background || { ...DEFAULT_BACKGROUND },
      cardColor: parsed.cardColor || { ...DEFAULT_CARD_COLOR },
      manualDayOverrides: parsed.manualDayOverrides || {},
    };
  } catch {
    return null;
  }
}

export function saveState(s: GameState, userId?: string) {
  if (typeof window === "undefined") return;
  try {
    const key = userId ? localCacheKey(userId) : KEY;
    window.localStorage.setItem(key, JSON.stringify(s));
  } catch (e) {
    console.warn("save failed", e);
  }
}

export function clearLegacyLocalState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function xpForNextLevel(level: number) {
  return 100 * level;
}

export type ScheduleMode = "weekly" | "cycle";

/**
 * Configurable work schedule, replacing the old binary "at work / day off"
 * toggle. Two modes cover any pattern the request asked for:
 * - "weekly": a fixed weekly pattern (7 booleans, Monday-first) — covers a
 *   classic 5/2 week and any other weekly-repeating ("free-form") pattern.
 * - "cycle": a repeating N-work/M-rest cycle anchored to a date — covers
 *   shift patterns that drift across weekdays (2/2, 4/3, etc.), which a
 *   weekly pattern can't express since they don't repeat every 7 days.
 */
export interface WorkSchedule {
  mode: ScheduleMode;
  /** Monday-first: index 0 = Monday, 6 = Sunday. */
  weeklyWorkDays: boolean[];
  cycleWorkDays: number;
  cycleRestDays: number;
  /** ISO date (todayKey format) of the first day of a work block in the cycle. */
  cycleAnchor: string;
}

/** Fresh default schedule (classic 5/2 week) — a function, not a frozen
 * constant, so cycleAnchor is always "today" at the moment it's needed
 * rather than whenever this module first happened to load. */
export function defaultSchedule(): WorkSchedule {
  return {
    mode: "weekly",
    weeklyWorkDays: [true, true, true, true, true, false, false], // classic 5/2
    cycleWorkDays: 2,
    cycleRestDays: 2,
    cycleAnchor: todayKey(),
  };
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Whether the given date counts as a work day under the schedule. */
export function isWorkDay(schedule: WorkSchedule, date = new Date()): boolean {
  if (schedule.mode === "weekly") {
    const dow = (date.getDay() + 6) % 7; // JS getDay is Sunday-first; convert to Monday-first
    return schedule.weeklyWorkDays[dow] ?? false;
  }
  const cycleLen = schedule.cycleWorkDays + schedule.cycleRestDays;
  if (cycleLen <= 0) return false;
  const anchor = new Date(`${schedule.cycleAnchor}T00:00:00`);
  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(anchor).getTime()) / 86_400_000,
  );
  const mod = ((diffDays % cycleLen) + cycleLen) % cycleLen;
  return mod < schedule.cycleWorkDays;
}

/**
 * Personalized hint for bodyweight-training quests: once the linked
 * personal record is set in "Тело", shows a real target rep count based on
 * recordPercent; otherwise falls back to the quest's default hint (no
 * personalization). Returns null for quests that aren't linked to a record.
 */
export function trainingHint(quest: Quest, body: BodyStats): string | null {
  if (!quest.linkedRecord || !quest.recordPercent) return null;
  const max = body[quest.linkedRecord];
  if (!max) return quest.trainingDefaultHint ?? "Сделай 3 подхода в комфортном темпе";
  const target = Math.max(1, Math.round(max * quest.recordPercent));
  const pct = Math.round(quest.recordPercent * 100);
  return `Сделай 3 подхода по ${pct}% от твоего максимума — это ${target} повторений за подход`;
}

/**
 * Applies the Work/Day-off lightening to a single quest for display: while
 * workMode is on, a quest with workModeTitle set shows the lightened
 * title/reward instead of the full one. Purely presentational — the
 * underlying quest record (and its reward on completion) uses whatever was
 * effective at the moment of completion.
 */
export function effectiveQuest(quest: Quest, workMode: boolean): Quest {
  if (!workMode || !quest.workModeTitle) return quest;
  return {
    ...quest,
    title: quest.workModeTitle,
    reward: quest.workModeReward ?? quest.reward,
  };
}

/**
 * Large pool of daily-quest templates, spread across all 4 stats and 3
 * rough difficulty bands (light 5-10 XP, medium 15-20, hard 25-30).
 * ensureDailyRotation() below draws a fresh random subset every day instead
 * of showing the same fixed list forever.
 */
export interface DailyQuestTemplate {
  title: string;
  stat: StatKey;
  reward: number;
  requiresPhoto?: boolean;
  photoHint?: string;
  requiresText?: boolean;
  workModeTitle?: string;
  workModeReward?: number;
}

export const DAILY_QUEST_POOL: DailyQuestTemplate[] = [
  // ── Сила ──
  {
    title: "Сделать разминку или растяжку 10 минут",
    stat: "strength",
    reward: 8,
    requiresPhoto: true,
    photoHint: "Фото/видео разминки",
  },
  {
    title: "Мини-тренировка: отжимания, приседания или планка",
    stat: "strength",
    reward: 12,
    requiresPhoto: true,
    photoHint: "Фото после тренировки",
    workModeTitle: "Короткая разминка/растяжка 5-10 минут",
    workModeReward: 8,
  },
  { title: "Сделать 30 приседаний", stat: "strength", reward: 8 },
  { title: "Планка 2 минуты — можно в несколько подходов", stat: "strength", reward: 10 },
  {
    title: "Прогулка быстрым шагом 20 минут",
    stat: "strength",
    reward: 8,
    requiresPhoto: true,
    photoHint: "Фото с прогулки",
  },
  {
    title: "Полноценная силовая тренировка 40-60 минут",
    stat: "strength",
    reward: 28,
    requiresPhoto: true,
    photoHint: "Фото после тренировки",
    workModeTitle: "Короткая тренировка 15 минут",
    workModeReward: 15,
  },
  { title: "100 приседаний за день суммарно, в любое время", stat: "strength", reward: 20 },
  { title: "Растяжка всего тела 15 минут перед сном", stat: "strength", reward: 10 },
  { title: "Подниматься по лестнице вместо лифта весь день", stat: "strength", reward: 6 },
  { title: "Пройти 10000 шагов за день (по трекеру)", stat: "strength", reward: 20 },

  // ── Интеллект ──
  {
    title: "Почитать книгу 30 минут",
    stat: "intellect",
    reward: 10,
    requiresPhoto: true,
    photoHint: "Фото раскрытой книги",
    workModeTitle: "Почитать книгу 10-15 минут",
    workModeReward: 6,
  },
  {
    title: "Изучить один новый факт или урок по теме, которая интересна",
    stat: "intellect",
    reward: 8,
    requiresPhoto: true,
    photoHint: "Скриншот статьи/видео/заметки",
  },
  { title: "Пройти урок на образовательной платформе", stat: "intellect", reward: 18 },
  { title: "Написать план на неделю по одной из своих целей", stat: "intellect", reward: 15 },
  {
    title: "Посмотреть обучающее видео 20 минут и законспектировать",
    stat: "intellect",
    reward: 15,
  },
  { title: "Решить 5 логических задач или головоломок", stat: "intellect", reward: 10 },
  {
    title: "Выучить новое слово на иностранном языке и повторить 10 раз",
    stat: "intellect",
    reward: 8,
  },
  {
    title: "Прочитать статью по теме саморазвития и выписать 3 идеи",
    stat: "intellect",
    reward: 12,
    requiresText: true,
  },
  {
    title: "Провести час глубокой работы без соцсетей (deep work)",
    stat: "intellect",
    reward: 25,
    workModeTitle: "Провести 25 минут глубокой работы без соцсетей",
    workModeReward: 15,
  },
  {
    title: "Разобрать и систематизировать заметки/файлы на компьютере",
    stat: "intellect",
    reward: 15,
  },

  // ── Воля ──
  {
    title: "Привести в порядок своё пространство (стол, комната)",
    stat: "will",
    reward: 8,
    requiresPhoto: true,
    photoHint: "Фото убранного пространства",
  },
  {
    title: "Гигиена: душ, чистка зубов, уход за собой",
    stat: "will",
    reward: 6,
    requiresPhoto: true,
    photoHint: "Селфи-подтверждение",
  },
  { title: "Встать без повторного будильника («ещё 5 минут»)", stat: "will", reward: 8 },
  { title: "Провести время после 21:00 без соцсетей", stat: "will", reward: 15 },
  {
    title: "Сделать то дело, которое откладываешь уже неделю",
    stat: "will",
    reward: 28,
    requiresText: true,
  },
  { title: "Помедитировать 10 минут", stat: "will", reward: 10 },
  { title: "Заполнить дневник или трекер привычек", stat: "will", reward: 6 },
  {
    title: "Приготовить еду самостоятельно, а не заказать",
    stat: "will",
    reward: 15,
    requiresPhoto: true,
    photoHint: "Фото готового блюда",
  },
  { title: "Лечь спать до полуночи", stat: "will", reward: 10 },
  {
    title: "Генеральная уборка одной зоны — шкаф, ящик или кухня",
    stat: "will",
    reward: 20,
    requiresPhoto: true,
    photoHint: "Фото результата",
  },

  // ── Харизма ──
  {
    title: "Выпить 2 литра воды за день",
    stat: "appearance",
    reward: 5,
    requiresPhoto: true,
    photoHint: "Фото бутылки воды или трекера",
  },
  {
    title: "Уход за кожей лица (умыться, увлажнить)",
    stat: "appearance",
    reward: 6,
    requiresPhoto: true,
    photoHint: "Селфи-подтверждение",
  },
  { title: "Сделать причёску/укладку, даже если никуда не идёшь", stat: "appearance", reward: 8 },
  { title: "Погладить или подготовить одежду на завтра", stat: "appearance", reward: 6 },
  {
    title: "Подобрать образ, в котором чувствуешь себя уверенно",
    stat: "appearance",
    reward: 10,
    requiresPhoto: true,
    photoHint: "Селфи в образе",
  },
  {
    title: "Полноценный уход: маска для лица или волос",
    stat: "appearance",
    reward: 15,
    requiresPhoto: true,
    photoHint: "Фото во время ухода",
  },
  { title: "Почистить обувь или привести в порядок гардероб", stat: "appearance", reward: 12 },
];

/** How many quests are drawn from DAILY_QUEST_POOL for each day. */
export const DAILY_QUEST_COUNT = 9;

/**
 * Draws a fresh random subset of DAILY_QUEST_POOL for today if it hasn't
 * been drawn yet, replacing whatever daily quests were active before.
 * Non-daily (story/purchase) quests are left untouched. Also records how
 * many mandatory quests were assigned today in dailyMandatoryCounts, so the
 * discipline calendar/streak can later check completeness by count instead
 * of by id (today's rotated ids won't exist tomorrow).
 */
export function ensureDailyRotation(state: GameState): GameState {
  const today = todayKey();
  if (state.dailyQuestsDate === today) return state;

  const now = Date.now();
  const pool = [...DAILY_QUEST_POOL].sort(() => Math.random() - 0.5);
  const picked = pool.slice(0, Math.min(DAILY_QUEST_COUNT, pool.length));
  const newDailies: Quest[] = picked.map((t) => ({
    id: uid(),
    title: t.title,
    stat: t.stat,
    reward: t.reward,
    category: "daily",
    mandatory: true,
    requiresPhoto: t.requiresPhoto,
    photoHint: t.photoHint,
    requiresText: t.requiresText,
    workModeTitle: t.workModeTitle,
    workModeReward: t.workModeReward,
    done: false,
    createdAt: now,
    lastResetDate: today,
  }));

  const nonDaily = state.quests.filter((q) => q.category !== "daily");
  return {
    ...state,
    quests: [...nonDaily, ...newDailies],
    dailyQuestsDate: today,
    dailyMandatoryCounts: { ...state.dailyMandatoryCounts, [today]: newDailies.length },
  };
}

/**
 * A rolling 30-day "season" — a fresh XP/quest counter layered on top of
 * overall progress, purely to give short-term goals against the fatigue of
 * an otherwise-unchanging quest list. Overall hero level/totalXp/stats are
 * never touched by a season rolling over — see ensureSeason() below.
 */
export interface SeasonState {
  seasonNumber: number;
  startedAt: number;
  xp: number;
  questsCompleted: number;
}

export interface SeasonSummary {
  seasonNumber: number;
  xp: number;
  questsCompleted: number;
  badgeUnlocked: boolean;
  endedAt: number;
}

export const SEASON_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** Season XP needed to unlock the season's cosmetic badge. */
export const SEASON_BADGE_XP_TARGET = 800;

/** Cosmetic badge icons, one per season, cycling if a player outlasts the list. */
const SEASON_BADGE_ICONS = ["🏵️", "🎖️", "🏆", "🥇", "💠", "🔶", "🌟"];

export function seasonBadgeIcon(seasonNumber: number): string {
  return SEASON_BADGE_ICONS[(seasonNumber - 1) % SEASON_BADGE_ICONS.length];
}

export function defaultSeason(): SeasonState {
  return { seasonNumber: 1, startedAt: Date.now(), xp: 0, questsCompleted: 0 };
}

/**
 * Rolls the season over once SEASON_DURATION_MS has elapsed since it
 * started: records a one-time summary (xp earned, quests completed,
 * whether the cosmetic badge was reached) for the results screen, then
 * starts a fresh season with a clean counter. Only ever touches
 * state.season/lastSeasonSummary/seasonSummarySeen — nothing else.
 */
export function ensureSeason(state: GameState): GameState {
  const elapsed = Date.now() - state.season.startedAt;
  if (elapsed < SEASON_DURATION_MS) return state;

  const summary: SeasonSummary = {
    seasonNumber: state.season.seasonNumber,
    xp: state.season.xp,
    questsCompleted: state.season.questsCompleted,
    badgeUnlocked: state.season.xp >= SEASON_BADGE_XP_TARGET,
    endedAt: state.season.startedAt + SEASON_DURATION_MS,
  };

  return {
    ...state,
    season: {
      seasonNumber: state.season.seasonNumber + 1,
      startedAt: Date.now(),
      xp: 0,
      questsCompleted: 0,
    },
    lastSeasonSummary: summary,
    seasonSummarySeen: false,
  };
}

/** Local pool of light bonus quests, drawn from when no daily quests remain today. */
export interface BonusQuestTemplate {
  title: string;
  stat: StatKey;
  reward: number;
}

export const BONUS_QUEST_POOL: BonusQuestTemplate[] = [
  { title: "Сделай 5-минутную растяжку глаз", stat: "will", reward: 5 },
  { title: "Позвони близкому человеку", stat: "will", reward: 8 },
  { title: "Приберись на рабочем столе 10 минут", stat: "will", reward: 6 },
  { title: "Сделай 20 приседаний прямо сейчас", stat: "strength", reward: 6 },
  { title: "Выпиши 3 вещи, за которые благодарен сегодня", stat: "intellect", reward: 6 },
  { title: "Послушай подкаст или лекцию 10 минут", stat: "intellect", reward: 8 },
  { title: "Завари чай осознанно, без телефона в руках", stat: "appearance", reward: 5 },
  { title: "Прогуляйся на свежем воздухе 10 минут", stat: "strength", reward: 8 },
  { title: "Разбери 10 старых фото в галерее телефона", stat: "will", reward: 5 },
  { title: "Напиши список дел на завтра", stat: "intellect", reward: 6 },
  { title: "Сделай себе комплимент перед зеркалом", stat: "appearance", reward: 5 },
  { title: "Проветри комнату 10 минут", stat: "will", reward: 5 },
  { title: "Сделай 10 глубоких осознанных вдохов-выдохов", stat: "will", reward: 5 },
  { title: "Полей цветы или приберись у растений", stat: "appearance", reward: 5 },
  { title: "Наведи порядок в закладках браузера 10 минут", stat: "intellect", reward: 6 },
];

const BONUS_REWARD_MULTIPLIER = 1.5;

/**
 * Ensures today's bonus-quest set is up to date: draws 2-3 random quests
 * from BONUS_QUEST_POOL (rewarded at 1.5x) once every daily quest is done,
 * and clears them out for a new day otherwise. Regenerating only once per
 * day (tracked via bonusQuestsDate) means completing/reopening quests during
 * the same day doesn't reshuffle the bonus set under the user.
 */
export function ensureBonusQuests(state: GameState): GameState {
  const today = todayKey();
  const dailyQuests = state.quests.filter((q) => q.category === "daily");
  const allDailyDone = dailyQuests.length > 0 && dailyQuests.every((q) => q.done);

  if (!allDailyDone) {
    if (state.bonusQuestsDate === today && state.bonusQuests.length === 0) return state;
    return { ...state, bonusQuests: [], bonusQuestsDate: today };
  }

  if (state.bonusQuestsDate === today && state.bonusQuests.length > 0) return state;

  const shuffled = [...BONUS_QUEST_POOL].sort(() => Math.random() - 0.5);
  const count = 2 + Math.round(Math.random()); // 2 or 3
  const now = Date.now();
  const bonusQuests: Quest[] = shuffled.slice(0, count).map((t) => ({
    id: uid(),
    title: t.title,
    stat: t.stat,
    reward: Math.round(t.reward * BONUS_REWARD_MULTIPLIER),
    category: "daily",
    done: false,
    createdAt: now,
    bonus: true,
  }));
  return { ...state, bonusQuests, bonusQuestsDate: today };
}

export function applyReward(state: GameState, stat: StatKey, reward: number): GameState {
  const next = structuredClone(state);
  const s = next.stats[stat];
  s.xp += reward;
  while (s.xp >= 100) {
    s.xp -= 100;
    s.level += 1;
  }
  next.totalXp += reward;
  while (next.totalXp >= xpForNextLevel(next.level)) {
    next.level += 1;
  }
  next.completedCount += 1;
  next.season = {
    ...next.season,
    xp: next.season.xp + reward,
    questsCompleted: next.season.questsCompleted + 1,
  };
  return next;
}

/**
 * Exact inverse of applyReward() — used by the "Отменить" undo toast after
 * completing a quest. Both counters it touches are simple base-100
 * odometers (stat level+xp) or a pure function of one running total
 * (hero level from totalXp), so both can be recomputed precisely from the
 * reward amount alone — no snapshot of prior state needed.
 */
export function undoReward(state: GameState, stat: StatKey, reward: number): GameState {
  const next = structuredClone(state);
  const s = next.stats[stat];
  const combined = Math.max(0, s.level * 100 + s.xp - reward);
  s.level = Math.floor(combined / 100);
  s.xp = combined % 100;

  next.totalXp = Math.max(0, next.totalXp - reward);
  let level = 1;
  while (next.totalXp >= xpForNextLevel(level)) level += 1;
  next.level = level;

  next.completedCount = Math.max(0, next.completedCount - 1);
  next.season = {
    ...next.season,
    xp: Math.max(0, next.season.xp - reward),
    questsCompleted: Math.max(0, next.season.questsCompleted - 1),
  };
  return next;
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Number of mandatory daily quests assigned on a given date. Reads the
 * recorded count for that date if we have one (dailyMandatoryCounts, filled
 * in by ensureDailyRotation); dates from before daily-quest rotation existed
 * won't have an entry, so those fall back to today's current mandatory
 * count, matching the old fixed-list behavior for historical data.
 */
function mandatoryCountFor(state: GameState, dateKey: string): number {
  const recorded = state.dailyMandatoryCounts[dateKey];
  if (recorded != null) return recorded;
  return state.quests.filter((q) => q.category === "daily" && q.mandatory).length;
}

export interface DayStatus {
  date: string;
  status: "green" | "red" | "pending" | "future";
  dayNum: number;
}

/**
 * Resolves a single day's discipline status. Manual overrides (Settings →
 * calendar edit) are only ever consulted for days strictly before today —
 * today and future days always take the live automatic path, so editing the
 * past can never affect (or be used to game) the current day's real-time
 * tracking.
 */
function resolveDayStatus(
  state: GameState,
  dateKey: string,
  todayK: string,
  isFuture: boolean,
): DayStatus["status"] {
  if (isFuture) return "future";
  if (dateKey === todayK) return "pending";
  const override = state.manualDayOverrides[dateKey];
  if (override) return override;
  const assigned = mandatoryCountFor(state, dateKey);
  const done = state.dailyCompletions[dateKey] || [];
  return assigned > 0 && done.length >= assigned ? "green" : "red";
}

export function computeDiscipline(state: GameState) {
  const start = new Date(state.depositStartAt);
  start.setHours(0, 0, 0, 0);
  const days: DayStatus[] = [];
  const now = new Date();
  const todayK = todayKey();

  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = todayKey(d);
    const isFuture = d > now && k !== todayK;
    const status = resolveDayStatus(state, k, todayK, isFuture);
    days.push({ date: k, status, dayNum: d.getDate() });
  }
  const redCount = days.filter((d) => d.status === "red").length;
  const greenCount = days.filter((d) => d.status === "green").length;
  const progress = Math.max(0, 100 - redCount * 5);
  const finished = Date.now() >= state.depositStartAt + DEPOSIT_DURATION_MS;
  const lost = finished && progress < 100;
  return { days, redCount, greenCount, progress, finished, lost };
}

/** Streak milestones that trigger a celebration when first reached. */
export const STREAK_MILESTONES = [7, 30, 100];

/**
 * True if every mandatory daily quest was completed on the given date.
 * Compares the count of completed daily quest ids against the number
 * assigned that day (see mandatoryCountFor) rather than matching exact ids,
 * since rotated daily quests get fresh ids every day.
 */
export function isDayFullyDone(state: GameState, dateKey: string): boolean {
  // A manual override for a past day (backfilling a forgotten log entry)
  // counts exactly like the real thing here too, so the streak stays
  // consistent with what the calendar shows. Never consulted for today —
  // callers pass today's key while it's still "pending", which isn't in
  // manualDayOverrides anyway since edits are blocked for today/future.
  const override = state.manualDayOverrides[dateKey];
  if (override) return override === "green";
  const assigned = mandatoryCountFor(state, dateKey);
  if (assigned === 0) return false;
  const done = state.dailyCompletions[dateKey] || [];
  return done.length >= assigned;
}

/**
 * Applies (or clears, with status=null) a manual discipline-day override.
 * Hard-guarded to strictly-past dates — attempting to edit today or a future
 * date is a no-op, so this can't be used to shortcut the live automatic
 * tracking no matter what the UI does.
 */
export function setManualDayOverride(
  state: GameState,
  dateKey: string,
  status: "green" | "red" | null,
): GameState {
  if (dateKey >= todayKey()) return state;
  const next = { ...state.manualDayOverrides };
  if (status === null) delete next[dateKey];
  else next[dateKey] = status;
  return { ...state, manualDayOverrides: next };
}

/**
 * Current streak of consecutive fully-completed days, counting backwards from
 * today over the full completion history (not capped to the deposit window).
 * Today counts once it's fully done; while today is still in progress it
 * neither adds to nor breaks the streak, so the run from yesterday is shown
 * until midnight.
 */
export function computeStreak(state: GameState): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let current = 0;
  let startOffset = 1; // default: begin at yesterday
  if (isDayFullyDone(state, todayKey(today))) {
    current = 1;
    startOffset = 1;
  }
  for (let i = startOffset; i <= 3660; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (isDayFullyDone(state, todayKey(d))) current += 1;
    else break;
  }
  return current;
}
