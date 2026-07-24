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
    <div className="panel p-5 transition-transform hover:-translate-y-0.5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-lg"
            style={{ background: `${meta.color}18`, color: meta.color }}
          >
            {meta.icon}
          </span>
          <span className="text-xs font-medium" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </div>
        <span className="text-lg font-semibold" style={{ color: meta.color }}>
          Ур. {level}
        </span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: meta.color }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{xp} XP</span>
        <span>/ 100</span>
      </div>
    </div>
  );
}
