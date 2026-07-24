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
}

export type RecordKey = "maxPushups" | "maxPullups" | "maxDips" | "maxLegRaises";

export const RECORD_META: Record<RecordKey, { label: string; unit: string }> = {
  maxPushups: { label: "Отжимания от пола (макс. за подход)", unit: "раз" },
  maxPullups: { label: "Подтягивания (макс. за подход)", unit: "раз" },
  maxDips: { label: "Отжимания на брусьях (макс. за подход)", unit: "раз" },
  maxLegRaises: { label: "Подъёмы ног на пресс (макс. за подход)", unit: "раз" },
};

export interface BodyStats {
  heightCm?: number;
  weightKg?: number;
  maxPushups?: number;
  maxPullups?: number;
  maxDips?: number;
  maxLegRaises?: number;
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
  appearance: { label: "Внешность", color: "#9b7a96", icon: "💎" },
};

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
    // DAILY (mandatory) — base starter set across all 4 stats
    q({
      title: "Сделать разминку или растяжку 10 минут",
      stat: "strength",
      reward: 8,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Фото/видео разминки",
    }),
    q({
      title: "Мини-тренировка: отжимания, приседания или планка",
      stat: "strength",
      reward: 12,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Фото после тренировки",
    }),
    q({
      title: "Почитать книгу 30 минут",
      stat: "intellect",
      reward: 10,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Фото раскрытой книги",
    }),
    q({
      title: "Изучить один новый факт или урок по теме, которая интересна",
      stat: "intellect",
      reward: 8,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Скриншот статьи/видео/заметки",
    }),
    q({
      title: "Привести в порядок своё пространство (стол, комната)",
      stat: "will",
      reward: 8,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Фото убранного пространства",
    }),
    q({
      title: "Гигиена: душ, чистка зубов, уход за собой",
      stat: "will",
      reward: 6,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Селфи-подтверждение",
    }),
    q({
      title: "Выпить 2 литра воды за день",
      stat: "appearance",
      reward: 5,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Фото бутылки воды или трекера",
    }),
    q({
      title: "Уход за кожей лица (умыться, увлажнить)",
      stat: "appearance",
      reward: 6,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Селфи-подтверждение",
    }),

    // STORY
    q({
      title: "Съездить на восток и сделать генеральную уборку",
      stat: "will",
      reward: 30,
      category: "story",
    }),
    q({
      title: "Выйти на пробежку",
      stat: "strength",
      reward: 15,
      category: "story",
      requiresPhoto: true,
      photoHint: "Фото с улицы",
    }),
    q({
      title: "Разобраться в вайбкодинге",
      stat: "intellect",
      reward: 20,
      category: "story",
      requiresText: true,
    }),
    q({
      title: "Начать учить английский язык",
      stat: "intellect",
      reward: 15,
      category: "story",
      requiresText: true,
    }),
    q({
      title: "Начать учить программирование",
      stat: "intellect",
      reward: 15,
      category: "story",
      requiresText: true,
    }),
    q({
      title: "Изучить уроки по вайтлистам",
      stat: "intellect",
      reward: 25,
      category: "story",
      requiresText: true,
    }),
    q({
      title: "Начать изучать, как создавать ТГ-ботов",
      stat: "intellect",
      reward: 20,
      category: "story",
      requiresText: true,
    }),
    q({
      title: "Начать изучать, как создать нейросеть под себя",
      stat: "intellect",
      reward: 30,
      category: "story",
      requiresText: true,
    }),
    q({
      title: "Придумать схему по арбитражу (купил дешевле — продал дороже)",
      stat: "will",
      reward: 25,
      category: "story",
    }),
    q({
      title: "Разобраться в мультиварке и приготовить блюдо",
      stat: "will",
      reward: 10,
      category: "story",
      requiresPhoto: true,
      photoHint: "Фото готового блюда",
    }),
    q({
      title: "Сходить подстричься и сделать брови",
      stat: "appearance",
      reward: 20,
      category: "story",
      requiresPhoto: true,
      photoHint: "Селфи «До/После»",
    }),
    q({ title: "Мб покрасить волосы", stat: "appearance", reward: 15, category: "story" }),

    // STORY — bodyweight training, personalized once a record is set in "Тело"
    q({
      title: "Сделать подход отжиманий от пола",
      stat: "strength",
      reward: 10,
      category: "story",
      linkedRecord: "maxPushups",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
    }),
    q({
      title: "Сделать подход подтягиваний",
      stat: "strength",
      reward: 15,
      category: "story",
      linkedRecord: "maxPullups",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
    }),
    q({
      title: "Сделать подход отжиманий на брусьях",
      stat: "strength",
      reward: 15,
      category: "story",
      linkedRecord: "maxDips",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
    }),
    q({
      title: "Сделать подход подъёмов ног на пресс",
      stat: "strength",
      reward: 10,
      category: "story",
      linkedRecord: "maxLegRaises",
      recordPercent: 0.7,
      trainingDefaultHint: "Сделай 3 подхода в комфортном темпе",
    }),

    // PURCHASE (already completed)
    q({
      title: "Найти умные очки Ray-Ban Meta Wayfarer Gen 2 RW4012 (1 700 ₽)",
      stat: "will",
      reward: 15,
      category: "purchase",
      done: true,
      completedAt: now,
    }),
    q({
      title: "Найти мужские кварцевые часы на Ozon (SKU: 2162649348)",
      stat: "will",
      reward: 10,
      category: "purchase",
      done: true,
      completedAt: now,
    }),
    q({
      title: "Составить список трат на месяц и подсчитать отложенные деньги",
      stat: "will",
      reward: 15,
      category: "purchase",
      done: true,
      completedAt: now,
    }),
    q({
      title: "Глянуть все видосы в избранном в ТТ",
      stat: "will",
      reward: 5,
      category: "purchase",
      done: true,
      completedAt: now,
    }),
    q({
      title: "Заказать на ВБ всё самое необходимое",
      stat: "will",
      reward: 10,
      category: "purchase",
      done: true,
      completedAt: now,
    }),

    // PURCHASE (open)
    q({
      title: "Продуть ПК от пыли",
      stat: "strength",
      reward: 15,
      category: "purchase",
      requiresPhoto: true,
      photoHint: "Фото чистого ПК",
    }),
    q({
      title: "Автосервис (СТО): комплексное ТО авто",
      stat: "will",
      reward: 50,
      category: "purchase",
      checklist: makeChecklist([
        "Замена АБС",
        "Кондиционер",
        "Поменять резину",
        "Поменять колодки",
        "Сделать потолок в машине",
      ]),
    }),
    q({
      title: "Глянуть все сохранённые ссылки и убрать лишнее",
      stat: "intellect",
      reward: 15,
      category: "purchase",
    }),
    q({ title: "Сходить в секонд-хенды", stat: "appearance", reward: 10, category: "purchase" }),
    q({
      title: "Разобраться в приложении с питанием",
      stat: "will",
      reward: 15,
      category: "purchase",
    }),
  ];
}

export function defaultState(): GameState {
  return {
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
    completedCount: 5, // 5 seeded purchase quests already done
    depositStartAt: Date.now(),
    depositAmount: 1000,
    depositLost: false,
    dailyCompletions: {},
    nutrition: {},
    body: {},
  };
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
  return next;
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Reset daily quests at midnight boundaries
export function resetDailyIfNeeded(state: GameState): GameState {
  const today = todayKey();
  let changed = false;
  const quests = state.quests.map((q) => {
    if (q.category !== "daily") return q;
    if (q.lastResetDate !== today && q.done) {
      changed = true;
      return {
        ...q,
        done: false,
        photoPath: undefined,
        proofNote: undefined,
        lastResetDate: today,
        completedAt: undefined,
      };
    }
    if (!q.lastResetDate) {
      changed = true;
      return { ...q, lastResetDate: today };
    }
    return q;
  });
  if (!changed) return state;
  return { ...state, quests };
}

export interface DayStatus {
  date: string;
  status: "green" | "red" | "pending" | "future";
  dayNum: number;
}

export function computeDiscipline(state: GameState) {
  const start = new Date(state.depositStartAt);
  start.setHours(0, 0, 0, 0);
  const days: DayStatus[] = [];
  const now = new Date();
  const todayK = todayKey();
  const mandatoryIds = state.quests
    .filter((q) => q.category === "daily" && q.mandatory)
    .map((q) => q.id);

  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = todayKey(d);
    let status: DayStatus["status"];
    if (d > now && k !== todayK) status = "future";
    else if (k === todayK) status = "pending";
    else {
      const done = state.dailyCompletions[k] || [];
      const allDone = mandatoryIds.every((id) => done.includes(id));
      status = allDone && mandatoryIds.length > 0 ? "green" : "red";
    }
    days.push({ date: k, status, dayNum: d.getDate() });
  }
  const redCount = days.filter((d) => d.status === "red").length;
  const greenCount = days.filter((d) => d.status === "green").length;
  const progress = Math.max(0, 100 - redCount * 5);
  const finished = Date.now() >= state.depositStartAt + DEPOSIT_DURATION_MS;
  const lost = finished && progress < 100;
  return { days, redCount, greenCount, progress, finished, lost };
}
