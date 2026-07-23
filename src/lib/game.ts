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
  done: boolean;
  mandatory?: boolean; // for daily → discipline calendar
  checklist?: ChecklistItem[];
  createdAt: number;
  completedAt?: number;
  lastResetDate?: string; // for daily quests, ISO date
  deadline?: number;
}

export interface StatState {
  level: number;
  xp: number;
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
}

const KEY = "rpg-life-state-v2";

/** Per-user local cache key, so multiple accounts on one browser don't collide. */
export function localCacheKey(userId: string) {
  return `${KEY}:${userId}`;
}

export const STAT_META: Record<StatKey, { label: string; color: string; glow: string; icon: string; gradient: string }> = {
  strength: {
    label: "Сила",
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.55)",
    icon: "⚔️",
    gradient: "linear-gradient(90deg, #b45309, #f59e0b, #fde68a)",
  },
  intellect: {
    label: "Интеллект",
    color: "#22d3ee",
    glow: "rgba(34,211,238,0.55)",
    icon: "🧠",
    gradient: "linear-gradient(90deg, #0e7490, #22d3ee, #a5f3fc)",
  },
  will: {
    label: "Воля",
    color: "#a3e635",
    glow: "rgba(163,230,53,0.55)",
    icon: "🔥",
    gradient: "linear-gradient(90deg, #4d7c0f, #a3e635, #d9f99d)",
  },
  appearance: {
    label: "Внешность",
    color: "#f0abfc",
    glow: "rgba(240,171,252,0.55)",
    icon: "💎",
    gradient: "linear-gradient(90deg, #a21caf, #d946ef, #f5d0fe)",
  },
};

export const CATEGORY_META: Record<QuestCategory, { label: string; icon: string; description: string }> = {
  daily: { label: "Ежедневные квесты", icon: "🌅", description: "Сброс в полночь. Требуют подтверждения." },
  story: { label: "Сюжетные квесты", icon: "📜", description: "Крупные разовые цели с дедлайном." },
  purchase: { label: "Квесты-закупки", icon: "🛒", description: "Поиск, менеджмент, оптимизация." },
};

export const DEPOSIT_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

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
    // DAILY (mandatory)
    q({
      title: "Почитать любую книгу 30 минут",
      stat: "intellect",
      reward: 5,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Фото раскрытой книги",
    }),
    q({
      title: "Тренировка шеи и уход за лицом",
      stat: "appearance",
      reward: 5,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Селфи-подтверждение",
    }),
    q({
      title: "Оптимизировать траты и внести в бюджет",
      stat: "will",
      reward: 3,
      category: "daily",
      mandatory: true,
      requiresPhoto: true,
      photoHint: "Скриншот или фото расходов",
    }),

    // STORY
    q({ title: "Съездить на восток и сделать генеральную уборку", stat: "will", reward: 30, category: "story" }),
    q({ title: "Выйти на пробежку", stat: "strength", reward: 15, category: "story", requiresPhoto: true, photoHint: "Фото с улицы" }),
    q({ title: "Разобраться в вайбкодинге", stat: "intellect", reward: 20, category: "story" }),
    q({ title: "Начать учить английский язык", stat: "intellect", reward: 15, category: "story" }),
    q({ title: "Начать учить программирование", stat: "intellect", reward: 15, category: "story" }),
    q({ title: "Изучить уроки по вайтлистам", stat: "intellect", reward: 25, category: "story" }),
    q({ title: "Начать изучать, как создавать ТГ-ботов", stat: "intellect", reward: 20, category: "story" }),
    q({ title: "Начать изучать, как создать нейросеть под себя", stat: "intellect", reward: 30, category: "story" }),
    q({ title: "Придумать схему по арбитражу (купил дешевле — продал дороже)", stat: "will", reward: 25, category: "story" }),
    q({ title: "Разобраться в мультиварке и приготовить блюдо", stat: "will", reward: 10, category: "story", requiresPhoto: true, photoHint: "Фото готового блюда" }),
    q({ title: "Сходить подстричься и сделать брови", stat: "appearance", reward: 20, category: "story", requiresPhoto: true, photoHint: "Селфи «До/После»" }),
    q({ title: "Мб покрасить волосы", stat: "appearance", reward: 15, category: "story" }),

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
    q({ title: "Глянуть все сохранённые ссылки и убрать лишнее", stat: "intellect", reward: 15, category: "purchase" }),
    q({ title: "Сходить в секонд-хенды", stat: "appearance", reward: 10, category: "purchase" }),
    q({ title: "Разобраться в приложении с питанием", stat: "will", reward: 15, category: "purchase" }),
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
      return { ...q, done: false, photoPath: undefined, lastResetDate: today, completedAt: undefined };
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
  const mandatoryIds = state.quests.filter((q) => q.category === "daily" && q.mandatory).map((q) => q.id);

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
