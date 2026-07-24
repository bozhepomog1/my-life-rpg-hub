interface Props {
  title: string;
  secondsLeft: number;
  onUndo: () => void;
  onDismiss: () => void;
}

/**
 * Bottom-center toast shown for a short window after completing a quest,
 * letting the user undo an accidental tap before it's "locked in". Purely
 * presentational — the parent owns the countdown and the actual undo logic.
 */
export function UndoToast({ title, secondsLeft, onUndo, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[130] flex justify-center px-4">
      <div className="panel-glow pointer-events-auto flex max-w-sm items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">Квест выполнен</div>
          <div className="truncate text-xs text-muted-foreground">{title}</div>
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:-translate-y-0.5 hover:bg-primary/10"
        >
          Отменить ({secondsLeft}с)
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Закрыть"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
