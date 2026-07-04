import { computeDiscipline, type GameState } from "@/lib/game";

export function DisciplineCalendar({ state }: Props) {
  const { days } = computeDiscipline(state);
  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm" style={{ color: "#22d3ee" }}>
          Календарь дисциплины
        </h3>
        <div className="flex gap-2 font-display text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Dot c="#a3e635" /> закрыт</span>
          <span className="flex items-center gap-1"><Dot c="#ef4444" /> пропуск</span>
          <span className="flex items-center gap-1"><Dot c="#22d3ee" /> сегодня</span>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {days.map((d, i) => {
          const cfg = STYLE[d.status];
          return (
            <div
              key={d.date}
              title={d.date}
              className="relative aspect-square rounded-md border grid place-items-center font-display text-xs"
              style={{
                borderColor: cfg.border,
                background: cfg.bg,
                color: cfg.color,
                boxShadow: cfg.glow,
              }}
            >
              <span className="text-[10px] absolute top-0.5 left-1 text-muted-foreground">
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
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />;
}

const STYLE: Record<string, { bg: string; border: string; color: string; glow: string; icon: string }> = {
  green: {
    bg: "linear-gradient(135deg, rgba(163,230,53,0.25), rgba(163,230,53,0.05))",
    border: "rgba(163,230,53,0.6)",
    color: "#a3e635",
    glow: "0 0 12px rgba(163,230,53,0.35), inset 0 0 12px rgba(163,230,53,0.15)",
    icon: "✓",
  },
  red: {
    bg: "linear-gradient(135deg, rgba(239,68,68,0.25), rgba(239,68,68,0.05))",
    border: "rgba(239,68,68,0.6)",
    color: "#ef4444",
    glow: "0 0 12px rgba(239,68,68,0.35), inset 0 0 12px rgba(239,68,68,0.15)",
    icon: "✕",
  },
  pending: {
    bg: "linear-gradient(135deg, rgba(34,211,238,0.25), rgba(34,211,238,0.05))",
    border: "rgba(34,211,238,0.6)",
    color: "#22d3ee",
    glow: "0 0 14px rgba(34,211,238,0.4), inset 0 0 12px rgba(34,211,238,0.15)",
    icon: "●",
  },
  future: {
    bg: "#0f1117",
    border: "#262a37",
    color: "#8b93a7",
    glow: "none",
    icon: "·",
  },
};
