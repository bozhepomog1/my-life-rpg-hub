import { STAT_META, type StatKey } from "@/lib/game";
import { ProgressBar } from "@/components/ProgressBar";

interface Props {
  stat: StatKey;
  level: number;
  xp: number;
}

export function StatBar({ stat, level, xp }: Props) {
  const meta = STAT_META[stat];
  const pct = Math.min(100, (xp / 100) * 100);
  return (
    <div className="panel p-4 sm:p-5">
      {/* Icon + name on one row, level on its own row underneath. These cards
          sit in a 2-col grid on mobile and a 4-col grid on desktop, so they're
          narrow at BOTH breakpoints — putting the name and "Уровень N" on the
          same line overflowed and clipped the longer labels ("Интеллект",
          "Харизма"). Stacking removes the failure mode entirely rather than
          relying on a breakpoint guess. */}
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base sm:h-9 sm:w-9 sm:text-lg"
            style={{ background: `${meta.color}18`, color: meta.color }}
          >
            {meta.icon}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-xs font-medium"
            style={{ color: meta.color }}
            title={meta.label}
          >
            {meta.label}
          </span>
        </div>
        <div className="mt-2 text-base font-semibold sm:text-lg" style={{ color: meta.color }}>
          Уровень {level}
        </div>
      </div>
      <ProgressBar value={pct} color={meta.color} />
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{xp} XP</span>
        <span>/ 100</span>
      </div>
    </div>
  );
}
