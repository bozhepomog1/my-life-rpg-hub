import { STAT_META, STAT_ORDER, type GameState } from "@/lib/game";

/**
 * Alternative "skill tree" view of the four characteristics, toggled against
 * the flat StatBar card grid from index.tsx via the "Дерево / Карточки"
 * switch. Renders each stat as its own small vertical node-chain: level 1 at
 * the bottom, connected upward by a single line, reached levels filled in
 * the stat's color, the current level pulsing, and a couple of "next" levels
 * shown outlined/dim above it as a preview of what's coming.
 *
 * There's no level cap in this game, so we can't draw the whole tree at
 * once — instead we show a fixed-size sliding window (WINDOW levels) ending
 * a couple of levels above the current one, which keeps every stat's tree
 * the same height regardless of how far along the player is.
 */

const WINDOW = 7;
const LOOKAHEAD = 2;

function levelsForWindow(level: number): number[] {
  const top = level + LOOKAHEAD;
  const bottom = Math.max(1, top - WINDOW + 1);
  const levels: number[] = [];
  for (let l = top; l >= bottom; l--) levels.push(l);
  return levels; // top-to-bottom, i.e. rendered top-to-bottom in a column
}

interface Props {
  state: GameState;
}

export function StatSkillTree({ state }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {STAT_ORDER.map((k) => (
        <StatTree key={k} stat={STAT_META[k]} level={state.stats[k].level} xp={state.stats[k].xp} />
      ))}
    </div>
  );
}

function StatTree({
  stat,
  level,
  xp,
}: {
  stat: { label: string; color: string; icon: string };
  level: number;
  xp: number;
}) {
  const levels = levelsForWindow(level);
  return (
    <div className="panel flex flex-col items-center gap-3 p-4 sm:p-5">
      <div className="flex items-center gap-2 self-start">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base"
          style={{ background: `${stat.color}18`, color: stat.color }}
        >
          {stat.icon}
        </span>
        <span className="truncate text-xs font-medium" style={{ color: stat.color }}>
          {stat.label}
        </span>
      </div>

      <div className="relative flex flex-col items-center">
        {/* Connecting line, drawn once behind all the nodes rather than per
            segment — simpler than N little line pieces and looks identical. */}
        <div
          className="absolute left-1/2 top-3 w-px -translate-x-1/2"
          style={{
            height: `${(levels.length - 1) * 50}px`,
            background: `linear-gradient(to bottom, ${stat.color}55, ${stat.color}20)`,
          }}
        />
        {levels.map((l, i) => {
          const reached = l <= level;
          const isCurrent = l === level;
          return (
            <div
              key={l}
              className="relative z-10 flex flex-col items-center"
              style={{ marginTop: i === 0 ? 0 : 14 }}
            >
              <div
                className={`animate-skill-node-grow grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-semibold transition-colors ${
                  isCurrent ? "animate-skill-node-pulse" : ""
                }`}
                style={{
                  animationDelay: `${i * 60}ms`,
                  borderColor: reached ? stat.color : "var(--color-border)",
                  background: reached ? `${stat.color}${isCurrent ? "33" : "1f"}` : "transparent",
                  color: reached ? stat.color : "var(--color-muted-foreground)",
                  ["--node-color" as string]: stat.color,
                }}
              >
                {l}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1 text-center">
        <div className="text-sm font-semibold" style={{ color: stat.color }}>
          Уровень {level}
        </div>
        <div className="text-[11px] text-muted-foreground">{xp} XP / 100</div>
      </div>
    </div>
  );
}
