import {
  mandatoryCountFor,
  STAT_META,
  STAT_ORDER,
  todayKey,
  type GameState,
  type StatKey,
} from "./game";

/**
 * Data prep for the "Статистика" screen (StatsPanel/routes/stats.tsx).
 * Kept as pure functions over GameState, separate from the component, so the
 * period-filter math (Block 2) can be unit-reasoned-about independently of
 * any rendering concerns.
 */

export type StatsPeriod = "week" | "month" | "all";

export const STATS_PERIOD_LABELS: Record<StatsPeriod, string> = {
  week: "Неделя",
  month: "Месяц",
  all: "Всё время",
};

/** Days since the account's discipline-calendar anchor (depositStartAt
 * doubles as this — see its doc comment in game.ts), inclusive of today.
 * Used for the "Всё время" period so it naturally grows with the account
 * instead of an arbitrary hardcoded cap. */
function daysSinceAnchor(state: GameState): number {
  const anchor = new Date(state.depositStartAt);
  anchor.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - anchor.getTime()) / 86_400_000) + 1;
  return Math.max(1, days);
}

export function periodDayCount(state: GameState, period: StatsPeriod): number {
  if (period === "week") return 7;
  if (period === "month") return 30;
  return daysSinceAnchor(state);
}

/** Ascending list of date keys (oldest first) covering the last N days,
 * ending today. */
function dateKeysForPeriod(state: GameState, period: StatsPeriod): string[] {
  const n = periodDayCount(state, period);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    keys.push(todayKey(d));
  }
  return keys;
}

/** Short "ДД.ММ" axis label from a "YYYY-MM-DD" key — avoids pulling in a
 * date-formatting library for something this small. */
function shortLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${d}.${m}`;
}

export interface XpPoint {
  date: string;
  label: string;
  xp: number;
}

/**
 * Total XP earned per day, summed from every completed quest's `reward`
 * (regular + bonus quests) whose `completedAt` falls on that day. Boss-quest
 * wins are deliberately left out here — BossWinRecord (game.ts) only keeps
 * the week/title/date for its Hall-of-Fame entry, not the XP amount, so
 * there's nothing to attribute retroactively. Simplest option: quests are
 * the overwhelming majority of XP anyway, so the chart stays accurate enough
 * without inventing a number.
 */
export function dailyXpSeries(state: GameState, period: StatsPeriod): XpPoint[] {
  const keys = dateKeysForPeriod(state, period);
  const totals = new Map<string, number>();
  for (const q of [...state.quests, ...state.bonusQuests]) {
    if (!q.done || q.completedAt == null) continue;
    const k = todayKey(new Date(q.completedAt));
    totals.set(k, (totals.get(k) ?? 0) + q.reward);
  }
  return keys.map((k) => ({ date: k, label: shortLabel(k), xp: totals.get(k) ?? 0 }));
}

export interface StatCategoryCount {
  stat: StatKey;
  label: string;
  color: string;
  count: number;
}

/** Completed-quest counts (regular + bonus) grouped by characteristic
 * (Сила/Интеллект/Воля/Харизма), restricted to the selected period. */
export function questsByStat(state: GameState, period: StatsPeriod): StatCategoryCount[] {
  const keys = new Set(dateKeysForPeriod(state, period));
  const counts: Record<StatKey, number> = { strength: 0, intellect: 0, will: 0, appearance: 0 };
  for (const q of [...state.quests, ...state.bonusQuests]) {
    if (!q.done || q.completedAt == null) continue;
    const k = todayKey(new Date(q.completedAt));
    if (!keys.has(k)) continue;
    counts[q.stat] += 1;
  }
  return STAT_ORDER.map((s) => ({
    stat: s,
    label: STAT_META[s].label,
    color: STAT_META[s].color,
    count: counts[s],
  }));
}

export interface CompletionPoint {
  date: string;
  label: string;
  pct: number;
  assigned: number;
  done: number;
}

/** % of that day's mandatory daily quests actually completed, per day in the
 * period — the "good day / bad day" chart. A day with zero mandatory quests
 * assigned (e.g. before the user added any) reports 0% rather than skipping
 * the point, so the axis stays continuous. */
export function dailyCompletionSeries(state: GameState, period: StatsPeriod): CompletionPoint[] {
  const keys = dateKeysForPeriod(state, period);
  return keys.map((k) => {
    const assigned = mandatoryCountFor(state, k);
    const done = Math.min(assigned, (state.dailyCompletions[k] || []).length);
    const pct = assigned > 0 ? Math.round((done / assigned) * 100) : 0;
    return { date: k, label: shortLabel(k), pct, assigned, done };
  });
}
