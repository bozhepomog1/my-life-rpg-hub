export type StatKey = "strength" | "intellect" | "will";

export interface Quest {
  id: string;
  title: string;
  stat: StatKey;
  reward: number;
  done: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface StatState {
  level: number;
  xp: number; // current xp toward next stat level (0..100)
}

export interface GameState {
  avatar: string; // emoji
  name: string;
  totalXp: number;
  level: number;
  stats: Record<StatKey, StatState>;
  quests: Quest[];
  completedCount: number;
}

const KEY = "rpg-life-state-v1";

export const STAT_META: Record<StatKey, { label: string; color: string; icon: string }> = {
  strength: { label: "Сила", color: "var(--strength)", icon: "⚔️" },
  intellect: { label: "Интеллект", color: "var(--intellect)", icon: "📘" },
  will: { label: "Воля", color: "var(--will)", icon: "🔥" },
};

export function defaultState(): GameState {
  return {
    avatar: "🧙",
    name: "Герой",
    totalXp: 0,
    level: 1,
    stats: {
      strength: { level: 0, xp: 0 },
      intellect: { level: 0, xp: 0 },
      will: { level: 0, xp: 0 },
    },
    quests: [],
    completedCount: 0,
  };
}

export function loadState(): GameState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(s: GameState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

// Level formula: total xp per hero level = 100 * level
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
