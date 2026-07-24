import { useState } from "react";
import { STAT_META, xpForNextLevel, type GameState, type StatKey } from "@/lib/game";
import { useAuthContext } from "@/lib/use-auth-context";
import { signOut } from "@/lib/auth";
import { ProgressBar } from "@/components/ProgressBar";

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
    <div className="panel-glow p-6">
      {user && (
        <div className="mb-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="truncate">{user.email}</span>
          <button
            type="button"
            onClick={() => signOut()}
            className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs transition-all hover:-translate-y-0.5 hover:border-destructive/50 hover:text-destructive"
          >
            Выйти
          </button>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-border bg-secondary text-4xl transition-transform hover:scale-105 sm:h-20 sm:w-20 sm:text-5xl"
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
                className="w-full border-b border-primary bg-transparent text-xl font-semibold outline-none sm:text-2xl"
              />
            ) : (
              <h1
                onClick={() => { setNameDraft(state.name); setEditingName(true); }}
                className="cursor-pointer truncate text-xl font-semibold sm:text-2xl"
                title="Изменить имя"
              >
                {state.name}
              </h1>
            )}
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              Топ: <span style={{ color: STAT_META[strongest].color }}>{STAT_META[strongest].label}</span>
              {" · "}Всего XP: <span className="text-foreground">{state.totalXp}</span>
            </p>
          </div>
        </div>
        <div
          className={`shrink-0 rounded-xl border border-border bg-secondary px-4 py-2 text-right ${levelUpPulse ? "animate-level-up" : ""}`}
        >
          <div className="text-[11px] tracking-wide text-muted-foreground">Уровень</div>
          <div className="text-2xl font-semibold text-primary sm:text-3xl">{state.level}</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
          <span>Прогресс уровня</span>
          <span>{currentLevelXp} / {need} XP</span>
        </div>
        <ProgressBar value={pct} />
      </div>

      {pickerOpen && (
        <div className="mt-4 flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              onClick={() => { onChangeAvatar(a); setPickerOpen(false); }}
              className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-secondary text-2xl transition-transform hover:scale-110 hover:border-primary"
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
