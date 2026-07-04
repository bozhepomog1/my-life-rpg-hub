import { STAT_META, type StatKey } from "@/lib/game";

interface Props {
  stat: StatKey;
  level: number;
  xp: number;
}

export function StatBar({ stat, level, xp }: Props) {
  const meta = STAT_META[stat];
  const pct = Math.min(100, (xp / 100) * 100);
  return (
    <div className="card-elevated p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{meta.icon}</span>
          <span className="font-display text-sm uppercase tracking-wider" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </div>
        <span className="font-display text-lg" style={{ color: meta.color }}>
          Ур. {level}
        </span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: meta.color, boxShadow: `0 0 12px ${meta.color}` }}
        />
        <div className="absolute inset-0 bar-shimmer rounded-full" />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{xp} XP</span>
        <span>100 XP</span>
      </div>
    </div>
  );
}
