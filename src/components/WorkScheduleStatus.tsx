import { Link } from "@tanstack/react-router";

interface Props {
  isWork: boolean;
}

/**
 * Replaces the old manual work/day-off toggle: today's status is now
 * derived automatically from the user's configured schedule (see
 * WorkSchedule in game.ts), so this is a read-only status line with a link
 * to Settings to change the underlying schedule — nothing to click here.
 */
export function WorkScheduleStatus({ isWork }: Props) {
  return (
    <div className="panel flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="flex items-center gap-2 text-sm font-medium">
        <span className="text-lg leading-none">{isWork ? "💼" : "🏖️"}</span>
        {isWork ? "Сегодня рабочий день" : "Сегодня выходной"}
      </span>
      <Link
        to="/settings"
        className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Изменить график
      </Link>
    </div>
  );
}
