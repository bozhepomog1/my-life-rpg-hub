import { useEffect } from "react";
import { todayKey } from "@/lib/game";
import { dailyQuestTally, setLastReminderDate, shouldRemind } from "@/lib/reminders";
import { useGameStateContext } from "@/lib/use-game-state-context";

const CHECK_INTERVAL_MS = 60_000;

/**
 * Mounted once at the app root. Purely a checker — it never asks for
 * Notification permission itself (that only happens from the explicit
 * "Включить напоминания" button in Settings). It just polls once a minute
 * for whether it's past 20:00 local time with unfinished daily quests, and
 * fires a single browser Notification for the day if so.
 *
 * Web Notifications only fire while this tab is open and running — there's
 * no way around that with this API, so the Settings copy is upfront about
 * it rather than implying it works with the browser closed.
 */
export function DailyReminderService() {
  const { state, hydrated } = useGameStateContext();

  useEffect(() => {
    if (!hydrated || !state.remindersEnabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    function check() {
      if (!shouldRemind(state)) return;
      const { total, remaining } = dailyQuestTally(state);
      try {
        new Notification("Не забудь про ежедневные квесты!", {
          body: `Осталось ${remaining} из ${total}`,
          icon: "/favicon.ico",
        });
      } catch (e) {
        console.warn("notification failed", e);
      }
      setLastReminderDate(todayKey());
    }

    check();
    const t = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hydrated, state]);

  return null;
}
