import {
  SEASON_BADGE_XP_TARGET,
  SEASON_DURATION_MS,
  seasonBadgeIcon,
  type SeasonState,
} from "@/lib/game";
import { ProgressBar } from "@/components/ProgressBar";

interface Props {
  season: SeasonState;
}

/** Compact home-screen widget: current season number, days left, and progress toward the seasonal cosmetic badge. */
export function SeasonProgress({ season }: Props) {
  const badgeUnlocked = season.xp >= SEASON_BADGE_XP_TARGET;
  const pct = Math.min(100, (season.xp / SEASON_BADGE_XP_TARGET) * 100);
  const daysLeft = Math.max(
    0,
    Math.ceil((season.startedAt + SEASON_DURATION_MS - Date.now()) / 86_400_000),
  );

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`text-xl leading-none ${badgeUnlocked ? "" : "opacity-30 grayscale"}`}>
            {seasonBadgeIcon(season.seasonNumber)}
          </span>
          <div>
            <div className="text-sm font-medium">Сезон {season.seasonNumber}</div>
            <div className="text-[11px] text-muted-foreground">
              {badgeUnlocked ? "Награда сезона разблокирована" : "Сезонная награда"}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-muted-foreground">
          {daysLeft} {daysLeft === 1 ? "день" : "дней"} до конца
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar value={pct} />
        <div className="mt-1 text-[11px] text-muted-foreground">
          {season.xp} / {SEASON_BADGE_XP_TARGET} XP за сезон
        </div>
      </div>
    </div>
  );
}
