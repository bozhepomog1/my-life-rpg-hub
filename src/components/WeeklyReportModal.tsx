import { CATEGORY_META, type QuestCategory, type WeeklyReport } from "@/lib/game";

interface Props {
  report: WeeklyReport;
  previous: WeeklyReport | null;
  onContinue: () => void;
}

const CATEGORIES: QuestCategory[] = ["daily", "story", "purchase"];

function Delta({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous == null) return null;
  const diff = current - previous;
  if (diff === 0) return <span className="text-muted-foreground">· без изменений</span>;
  const up = diff > 0;
  return (
    <span className={up ? "text-success" : "text-destructive"}>
      · {up ? "▲" : "▼"} {up ? "+" : ""}
      {diff} к прошлой неделе
    </span>
  );
}

/**
 * Full-screen "Итоги недели" report — shown once right after
 * ensureWeekRollover() detects a new week (see weeklyReportSeen in
 * index.tsx), same pattern as SeasonSummaryModal. Purely informational: the
 * new week (and new boss quest) has already started by the time this shows.
 */
export function WeeklyReportModal({ report, previous, onContinue }: Props) {
  const bestDayLabel = report.bestDay
    ? new Date(
        report.bestDay.dateKey.split("-").map(Number)[0],
        report.bestDay.dateKey.split("-").map(Number)[1] - 1,
        report.bestDay.dateKey.split("-").map(Number)[2],
      ).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
    : null;

  return (
    <div className="fixed inset-0 z-[150] grid place-items-center overflow-y-auto bg-background/90 p-6 backdrop-blur-sm">
      <div className="panel-glow w-full max-w-md p-8 text-center">
        <div className="text-xs font-medium tracking-wide text-muted-foreground">
          Итоги недели №{report.weekNumber}
        </div>
        <div className="mt-2 text-4xl">📊</div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-secondary px-3 py-3">
            <div className="text-2xl font-semibold text-primary">{report.totalQuests}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Квестов выполнено</div>
            <div className="mt-1 text-[10px]">
              <Delta current={report.totalQuests} previous={previous?.totalQuests} />
            </div>
          </div>
          <div className="rounded-xl bg-secondary px-3 py-3">
            <div className="text-2xl font-semibold text-primary">{report.xpEarned}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">XP заработано</div>
            <div className="mt-1 text-[10px]">
              <Delta current={report.xpEarned} previous={previous?.xpEarned} />
            </div>
          </div>
          <div className="rounded-xl bg-secondary px-3 py-3">
            <div className="text-2xl font-semibold text-primary">💰 {report.goldEarned}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Золота заработано</div>
            <div className="mt-1 text-[10px]">
              <Delta current={report.goldEarned} previous={previous?.goldEarned} />
            </div>
          </div>
          <div className="rounded-xl bg-secondary px-3 py-3">
            <div className="text-2xl font-semibold text-primary">
              {report.bossQuestWon ? "🐉" : "—"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {report.bossQuestTitle
                ? report.bossQuestWon
                  ? "Босс-квест пройден"
                  : "Босс-квест не пройден"
                : "Без босс-квеста"}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-secondary/60 px-4 py-3 text-left">
          <div className="mb-2 text-xs font-medium text-muted-foreground">По категориям</div>
          <div className="space-y-1 text-sm">
            {CATEGORIES.map((cat) => (
              <div key={cat} className="flex items-center justify-between">
                <span>
                  {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
                </span>
                <span className="font-medium">{report.byCategory[cat] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {bestDayLabel && (
          <p className="mt-4 text-xs text-muted-foreground">
            Лучший день недели — <span className="text-foreground">{bestDayLabel}</span> (
            {report.bestDay?.count} квестов)
          </p>
        )}

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
