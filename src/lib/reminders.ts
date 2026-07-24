import { todayKey, type GameState } from "./game";

/** Local hour (24h, browser-local time) after which an unfinished-quests reminder may fire. */
export const REMINDER_HOUR = 20;

/** Device-local guard so a reload after 20:00 doesn't re-fire the same day's reminder. */
const LAST_REMINDER_KEY = "life-rpg-last-reminder-date";

export function getLastReminderDate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_REMINDER_KEY);
  } catch {
    return null;
  }
}

export function setLastReminderDate(date: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_REMINDER_KEY, date);
  } catch {
    // ignore
  }
}

export interface DailyQuestTally {
  total: number;
  remaining: number;
}

export function dailyQuestTally(state: GameState): DailyQuestTally {
  const dailies = state.quests.filter((q) => q.category === "daily");
  return { total: dailies.length, remaining: dailies.filter((q) => !q.done).length };
}

/**
 * Whether a reminder notification should fire right now: reminders are on,
 * Notification permission was actually granted, it's past REMINDER_HOUR
 * local time, today's reminder hasn't already been shown, and at least one
 * daily quest is still open.
 */
export function shouldRemind(state: GameState, now = new Date()): boolean {
  if (!state.remindersEnabled) return false;
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  if (now.getHours() < REMINDER_HOUR) return false;
  if (getLastReminderDate() === todayKey(now)) return false;
  return dailyQuestTally(state).remaining > 0;
}
