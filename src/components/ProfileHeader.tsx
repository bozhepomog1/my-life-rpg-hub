import { useState } from "react";
import { STAT_META, xpForNextLevel, type GameState, type StatKey } from "@/lib/game";
import { useAuthContext } from "@/lib/auth-context";
import { signOut } from "@/lib/auth";

const AVATARS = ["🥷", "🧙", "🧝", "🧛", "🦸", "🧑‍🚀", "🧑‍🎤", "🧑‍💻", "🐉", "🦁", "🦄", "👑"];

interface Props {
  state: GameState;
  onChangeAvatar: (a: string) => void;
  onChangeName: (n: string) => void;
  levelUpPulse: boolean;
}

export function ProfileHeader({ state, onChangeAvatar, onChangeName, levelUpPulse }: Props) {
  const { user } = useAuthContext();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(state.name);

  const need = xpForNextLevel(state.level);
  const currentLevelXp = state.totalXp - (state.level - 1) * need;
  const pct = Math.min(100, Math.max(0, (currentLevelXp / need) * 100));

  const strongest = (Object.keys(state.stats) as StatKey[]).reduce((a, b) =>
    state.stats[a].level * 100 + state.stats[a].xp >= state.stats[b].level * 100 + state.stats[b].xp ? a : b
  );

  return (
    <div className={`panel-glow corner-cut relative overflow-hidden p-5 ${levelUpPulse ? "animate-level-up" : ""}`}>
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-40" />

      {user && (
        <div className="relative mb-2 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{user.email}</span>
          <button
            type="button"
            onClick={() => signOut()}
            className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-display text-[9px] tracking-wider hover:border-destructive/50 hover:text-destructive"
          >
            ВЫЙТИ
          </button>
        </div>
      )}
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border-2 text-4xl transition-transform hover:scale-105 sm:h-20 sm:w-20 sm:text-5xl"
            style={{
              borderColor: "#22d3ee",
              background: "linear-gradient(135deg, rgba(34,211,238,0.15), rgba(240,171,252,0.1))",
              boxShadow: "0 0 20px rgba(34,211,238,0.4), inset 0 0 20px rgba(34,211,238,0.15)",
            }}
            title="Сменить аватар"
          >
            {state.avatar}
          </button>
          <div className="min-w-0">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  onChangeName(nameDraft.trim() || "Герой");
                  setEditingName(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="w-full border-b border-primary bg-transparent font-display text-xl outline-none sm:text-2xl"
              />
            ) : (
              <h1
                onClick={() => { setNameDraft(state.name); setEditingName(true); }}
                className="cursor-pointer truncate font-display text-xl neon-text sm:text-2xl"
                style={{ color: "#e6edf3" }}
                title="Изменить имя"
              >
                {state.name}
              </h1>
            )}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Топ: <span style={{ color: STAT_META[strongest].color }}>{STAT_META[strongest].label}</span>
              {" · "}Всего XP: <span className="text-foreground">{state.totalXp}</span>
            </p>
          </div>
        </div>
        <div
          className="shrink-0 rounded-md border px-3 py-1.5 text-right"
          style={{
            borderColor: "#22d3ee",
            background: "rgba(34,211,238,0.1)",
            boxShadow: "0 0 14px rgba(34,211,238,0.3)",
          }}
        >
          <div className="font-display text-[9px] tracking-[0.25em] text-muted-foreground">LEVEL</div>
          <div className="font-display text-2xl neon-text sm:text-3xl" style={{ color: "#22d3ee" }}>
            {state.level}
          </div>
        </div>
      </div>

      <div className="relative mt-4">
        <div className="mb-1 flex justify-between font-display text-[10px] text-muted-foreground">
          <span>ПРОГРЕСС УРОВНЯ</span>
          <span>{currentLevelXp} / {need} XP</span>
        </div>
        <div className="bar-track">
          <div
            className="bar-fill"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #22d3ee, #f0abfc, #a3e635)",
              color: "#22d3ee",
            }}
          />
        </div>
      </div>

      {pickerOpen && (
        <div className="relative mt-4 flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              onClick={() => { onChangeAvatar(a); setPickerOpen(false); }}
              className="grid h-11 w-11 place-items-center rounded-md border border-border bg-black/40 text-2xl transition-all hover:scale-110 hover:border-primary"
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
