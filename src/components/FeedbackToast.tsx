import { useEffect } from "react";

interface Props {
  message: string;
  /** Optional real, factual line (e.g. an actual within-goal streak count) —
   * never an invented number. See TRAINING_FEEDBACK_MESSAGES/
   * NUTRITION_FEEDBACK_MESSAGES in game.ts for why the main message never
   * carries one. */
  detail?: string;
  icon?: string;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3200;

/**
 * Top-center toast for the "instant feedback" moment after a training quest
 * or an in-goal nutrition log — deliberately separate from UndoToast's
 * bottom position so the two never visually collide when both can appear
 * moments apart. Auto-dismisses itself; the parent only needs to swap the
 * `message`/give it a fresh key to restart the timer for a new toast.
 */
export function FeedbackToast({ message, detail, icon = "✨", onDismiss }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[140] flex justify-center px-4">
      <div className="panel-glow pointer-events-auto flex max-w-sm items-start gap-3 px-4 py-3 animate-in fade-in slide-in-from-top-2">
        <span className="text-xl leading-none">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-snug">{message}</div>
          {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
        </div>
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
