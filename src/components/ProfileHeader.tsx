import { STAT_META, xpForNextLevel, type GameState } from "@/lib/game";

interface Props {
  state: GameState;
  onAvatarClick: () => void;
}

const AVATARS = ["🧙", "🧝", "🧛", "🥷", "🦸", "🧑‍🚀", "🧑‍🎤", "🧑‍💻", "🐉", "🦁"];

export function ProfileHeader({ state, onAvatarClick }: Props) {
  const need = xpForNextLevel(state.level);
  const pct = Math.min(100, ((state.totalXp % need) / need) * 100);
  const strongest = (Object.keys(state.stats) as Array<keyof typeof state.stats>).reduce((a, b) =>
    state.stats[a].level * 100 + state.stats[a].xp >= state.stats[b].level * 100 + state.stats[b].xp ? a : b
  );

  return (
    <div className="card-elevated relative overflow-hidden p-6">
      <div
        className="absolute inset-0 opacity-20"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        <button
          onClick={onAvatarClick}
          className="glow group grid h-24 w-24 shrink-0 place-items-center rounded-full border-2 border-primary bg-background text-5xl transition-transform hover:scale-105"
          title="Сменить аватар"
        >
          <span className="transition-transform group-hover:rotate-12">{state.avatar}</span>
        </button>
        <div className="flex-1 text-center sm:text-left w-full">
          <div className="flex flex-wrap items-baseline justify-center gap-2 sm:justify-start">
            <h1 className="font-display text-2xl sm:text-3xl">{state.name}</h1>
            <span className="rounded-full bg-primary px-3 py-0.5 font-display text-sm text-primary-foreground">
              Уровень {state.level}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Сильнейшая характеристика: <span style={{ color: STAT_META[strongest].color }}>{STAT_META[strongest].label}</span>
          </p>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Общий XP</span>
              <span>{state.totalXp} / до сл. уровня {state.level * need}</span>
            </div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                style={{ width: `${pct}%`, background: "var(--gradient-xp)" }}
              />
            </div>
          </div>
        </div>
      </div>

      <details className="relative mt-4">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Сменить аватар
        </summary>
        <div className="mt-2 flex flex-wrap gap-2" onClick={onAvatarClick}>
          {AVATARS.map((a) => (
            <button
              key={a}
              data-avatar={a}
              className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-background text-2xl hover:border-primary"
            >
              {a}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

export { AVATARS };
