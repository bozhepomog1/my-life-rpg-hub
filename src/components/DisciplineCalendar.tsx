import { computeDiscipline, type GameState } from "@/lib/game";

export function DisciplineCalendar({ state }: Props) {
  const { days } = computeDiscipline(state);
  return (
    <div className="panel p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Календарь дисциплины</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Dot c="var(--color-success)" /> закрыт</span>
          <span className="flex items-center gap-1"><Dot c="var(--color-destructive)" /> пропуск</span>
          <span className="flex items-center gap-1"><Dot c="var(--color-primary)" /> сегодня</span>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {days.map((d, i) => {
          const cfg = STYLE[d.status];
          return (
            <div
              key={d.date}
              title={d.date}
              className="relative aspect-square grid place-items-center rounded-lg border text-xs"
              style={{ borderColor: cfg.border, background: cfg.bg, color: cfg.color }}
            >
              <span className="absolute left-1 top-0.5 text-[10px] text-muted-foreground">
                {i + 1}
              </span>
              <span className="text-sm">{cfg.icon}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface Props { state: GameState }

function Dot({ c }: { c: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />;
}

const STYLE: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  green: {
    bg: "color-mix(in srgb, var(--color-success) 14%, transparent)",
    border: "color-mix(in srgb, var(--color-success) 45%, transparent)",
    color: "var(--color-success)",
    icon: "✓",
  },
  red: {
    bg: "color-mix(in srgb, var(--color-destructive) 12%, transparent)",
    border: "color-mix(in srgb, var(--color-destructive) 40%, transparent)",
    color: "var(--color-destructive)",
    icon: "✕",
  },
  pending: {
    bg: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
    border: "color-mix(in srgb, var(--color-primary) 40%, transparent)",
    color: "var(--color-primary)",
    icon: "●",
  },
  future: {
    bg: "var(--color-muted)",
    border: "var(--color-border)",
    color: "var(--color-muted-foreground)",
    icon: "·",
  },
};
