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
    // Higher up on mobile (bottom-20) so it floats above the fixed bottom
    // nav bar (see BottomNav in routes/index.tsx) instead of overlapping
    // it; back to its original bottom-4 at md and up, where there's no
    // bottom nav to clear.
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[130] flex justify-center px-4 md:bottom-4">
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
