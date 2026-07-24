import { seasonBadgeIcon, type SeasonSummary } from "@/lib/game";

interface Props {
  summary: SeasonSummary;
  onContinue: () => void;
}

/**
 * Full-screen "season results" shown once, right after a season rolls over
 * (see ensureSeason() in game.ts). Purely informational — the new season
 * has already started by the time this shows; "Продолжить" just dismisses
 * it (marks lastSeasonSummary as seen).
 */
export function SeasonSummaryModal({ summary, onContinue }: Props) {
  return (
    <div className="fixed inset-0 z-[150] grid place-items-center bg-background/90 p-6 backdrop-blur-sm">
      <div className="panel-glow w-full max-w-sm p-8 text-center">
        <div className="text-xs font-medium tracking-wide text-muted-foreground">
          Сезон {summary.seasonNumber} завершён
        </div>

        <div className={`mt-4 text-6xl ${summary.badgeUnlocked ? "" : "opacity-30 grayscale"}`}>
          {seasonBadgeIcon(summary.seasonNumber)}
        </div>
        <div className="mt-2 text-sm font-medium text-foreground">
          {summary.badgeUnlocked
            ? "Сезонная награда разблокирована!"
            : "Награда сезона не разблокирована"}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-secondary px-3 py-3">
            <div className="text-2xl font-semibold text-primary">{summary.xp}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">XP за сезон</div>
          </div>
          <div className="rounded-xl bg-secondary px-3 py-3">
            <div className="text-2xl font-semibold text-primary">{summary.questsCompleted}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Квестов выполнено</div>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Твой уровень героя и общий прогресс не сбрасываются — обнулился только сезонный счётчик.
          Начинается сезон {summary.seasonNumber + 1}.
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="mt-6 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5"
        >
          Продолжить
        </button>
      </div>
    </div>
  );
}
