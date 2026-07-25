interface Props {
  current: number;
  longest: number;
}

export function StreakBanner({ current, longest }: Props) {
  return (
    <div className="panel flex items-center justify-between gap-4 p-5 sm:p-6">
      <div>
        <div className="text-xs text-muted-foreground">Серия дней подряд</div>
        {current > 0 ? (
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl">🔥</span>
            <span className="text-3xl font-semibold text-foreground sm:text-4xl">{current}</span>
            <span className="text-sm text-muted-foreground">
              {current === 1 ? "день подряд" : "дней подряд"}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Закрой все обязательные квесты сегодня, чтобы начать серию
          </p>
        )}
      </div>
      <div className="shrink-0 rounded-xl border border-border bg-secondary px-3 py-2 text-center">
        <div className="text-[11px] tracking-wide text-muted-foreground">Рекорд</div>
        <div className="text-xl font-semibold text-accent-2 sm:text-2xl">{longest}</div>
      </div>
    </div>
  );
}
