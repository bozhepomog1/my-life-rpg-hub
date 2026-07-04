import { useState } from "react";
import { STAT_META, xpForNextLevel, type GameState } from "@/lib/game";

const AVATARS = ["🧙", "🧝", "🧛", "🥷", "🦸", "🧑‍🚀", "🧑‍🎤", "🧑‍💻", "🐉", "🦁", "🦄", "👑"];

interface Props {
  state: GameState;
  onChangeAvatar: (a: string) => void;
  onChangeName: (n: string) => void;
  levelUpPulse: boolean;
}

export function ProfileHeader({ state, onChangeAvatar, onChangeName, levelUpPulse }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(state.name);

  const need = xpForNextLevel(state.level);
  const currentLevelXp = state.totalXp - (state.level - 1) * need;
  const pct = Math.min(100, Math.max(0, (currentLevelXp / need) * 100));

  const strongest = (Object.keys(state.stats) as Array<keyof typeof state.stats>).reduce((a, b) =>
    state.stats[a].level * 100 + state.stats[a].xp >= state.stats[b].level * 100 + state.stats[b].xp ? a : b
  );

  return (
    <div className={`card-elevated relative overflow-hidden p-6 ${levelUpPulse ? "animate-level-up" : ""}`}>
      <div className="absolute inset-0 opacity-20" style={{ background: "var(--gradient-hero)" }} />
      <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="glow grid h-24 w-24 shrink-0 place-items-center rounded-full border-2 border-primary bg-background text-5xl transition-transform hover:scale-105"
          title="Сменить аватар"
        >
          {state.avatar}
        </button>
        <div className="w-full flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-baseline justify-center gap-2 sm:justify-start">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  onChangeName(nameDraft.trim() || "Герой");
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="bg-transparent border-b border-primary outline-none font-display text-2xl sm:text-3xl"
              />
            ) : (
              <h1
                onClick={() => {
                  setNameDraft(state.name);
                  setEditingName(true);
                }}
                className="cursor-pointer font-display text-2xl sm:text-3xl hover:text-primary"
                title="Изменить имя"
              >
                {state.name}
              </h1>
            )}
            <span className="rounded-full bg-primary px-3 py-0.5 font-display text-sm text-primary-foreground">
              Ур. {state.level}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Топ характеристика:{" "}
            <span style={{ color: STAT_META[strongest].color }}>{STAT_META[strongest].label}</span>
          </p>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Общий XP: {state.totalXp}</span>
              <span>{currentLevelXp} / {need}</span>
            </div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                style={{ width: `${pct}%`, background: "var(--gradient-xp)" }}
              />
              <div className="absolute inset-0 bar-shimmer rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <div className="relative mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
          {AVATARS.map((a) => (
            <button
              key={a}
              onClick={() => {
                onChangeAvatar(a);
                setPickerOpen(false);
              }}
              className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-background text-2xl transition-all hover:border-primary hover:scale-110"
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
