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
    <div
      className="panel p-4 transition-transform hover:-translate-y-0.5"
      style={{ borderColor: `${meta.color}30` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="grid h-9 w-9 place-items-center rounded-md border text-lg"
            style={{ borderColor: `${meta.color}55`, background: `${meta.color}10`, color: meta.color }}
          >
            {meta.icon}
          </span>
          <span
            className="font-display text-[11px]"
            style={{ color: meta.color, textShadow: `0 0 8px ${meta.glow}` }}
          >
            {meta.label}
          </span>
        </div>
        <span
          className="font-display text-xl"
          style={{ color: meta.color, textShadow: `0 0 10px ${meta.glow}` }}
        >
          LV {level}
        </span>
      </div>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{ width: `${pct}%`, background: meta.gradient, color: meta.color }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-display text-muted-foreground">
        <span>{xp} XP</span>
        <span>/ 100</span>
      </div>
    </div>
  );
}
