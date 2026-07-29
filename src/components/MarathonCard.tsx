import { ProgressBar } from "@/components/ProgressBar";
import { MARATHON_TEMPLATES, marathonById } from "@/lib/marathons";
import type { GameState } from "@/lib/game";

interface Props {
  state: GameState;
  onStart: (templateId: string) => void;
  onAbandon: () => void;
}

/**
 * Multi-day themed streak, separate from the discipline calendar/deposit —
 * missing a day resets THIS progress to 0 with no other penalty. Only one
 * marathon can run at a time, so this either shows a picker grid (nothing
 * active, or the previous one just finished) or the running one's progress.
 */
export function MarathonCard({ state, onStart, onAbandon }: Props) {
  const active = state.activeMarathon;
  const template = active ? marathonById(active.templateId) : null;

  if (active && template) {
    const pct = (active.progressDays / template.days) * 100;
    return (
      <div className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {template.icon} {template.title}
          </h3>
          <span className="shrink-0 text-xs font-medium text-primary">
            Награда: +{template.xpReward} XP · +{template.goldReward}💰
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{template.description}</p>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Дней подряд</span>
            <span>
              {active.progressDays}/{template.days}
            </span>
          </div>
          <ProgressBar value={pct} />
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Пропустишь день — прогресс марафона сгорит до нуля (на общий календарь дисциплины это не
          влияет).
        </p>

        {active.completed ? (
          <div className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-center text-xs text-success">
            Марафон пройден — награда уже начислена! 🎉 Выбери следующий ниже.
          </div>
        ) : (
          <button
            type="button"
            onClick={onAbandon}
            className="mt-3 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:bg-secondary"
          >
            Прервать марафон
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="panel p-5 sm:p-6">
      <h3 className="text-sm font-semibold">🏁 Марафоны</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Многодневная тематическая цепочка — выбери одну, веди только её до конца или до первого
        пропуска.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {MARATHON_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onStart(t.id)}
            className="rounded-xl border border-border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-secondary"
          >
            <div className="text-sm font-medium">
              {t.icon} {t.title}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{t.description}</div>
            <div className="mt-1 text-[11px] font-medium text-primary">
              +{t.xpReward} XP · +{t.goldReward}💰
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
