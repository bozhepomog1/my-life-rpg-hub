import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";
import { STAT_META, xpForNextLevel, type GameState, type StatKey } from "@/lib/game";
import { useAuthContext } from "@/lib/use-auth-context";
import { signOut } from "@/lib/auth";
import { ProgressBar } from "@/components/ProgressBar";
import { ShareCardModal } from "@/components/ShareCardModal";
import { useMyShortCode } from "@/hooks/use-my-short-code";
import { getAvatarPhotoUrl, uploadAvatarPhoto } from "@/lib/avatar-photo";

// Kept gender-neutral throughout — two more added (🧚, 🦋) alongside the
// existing set for a softer aesthetic option, without removing any of the
// originals.
const AVATARS = [
  "🥷",
  "🧙",
  "🧝",
  "🧛",
  "🦸",
  "🧑‍🚀",
  "🧑‍🎤",
  "🧑‍💻",
  "🐉",
  "🦁",
  "🦄",
  "👑",
  "🧚",
  "🦋",
];

interface Props {
  state: GameState;
  onChangeAvatar: (a: string) => void;
  onChangeAvatarPhoto: (path: string | undefined) => void;
  onChangeName: (n: string) => void;
  levelUpPulse: boolean;
}

export function ProfileHeader({
  state,
  onChangeAvatar,
  onChangeAvatarPhoto,
  onChangeName,
  levelUpPulse,
}: Props) {
  const { user } = useAuthContext();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(state.name);
  const [shareOpen, setShareOpen] = useState(false);
  const { code: myCode } = useMyShortCode();
  const [codeCopied, setCodeCopied] = useState(false);
  const [avatarPhotoUrl, setAvatarPhotoUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!state.avatarPhotoPath) {
      setAvatarPhotoUrl(null);
      return;
    }
    getAvatarPhotoUrl(state.avatarPhotoPath).then((url) => {
      if (!cancelled) setAvatarPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [state.avatarPhotoPath]);

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setAvatarUploading(true);
    try {
      const path = await uploadAvatarPhoto(user.id, file);
      onChangeAvatarPhoto(path);
    } catch (err) {
      console.warn("avatar photo upload failed", err);
    } finally {
      setAvatarUploading(false);
    }
  }

  async function copyMyCode() {
    if (!myCode) return;
    try {
      await navigator.clipboard.writeText(myCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch (e) {
      console.warn("copy failed", e);
    }
  }

  const need = xpForNextLevel(state.level);
  const currentLevelXp = state.totalXp - (state.level - 1) * need;
  const pct = Math.min(100, Math.max(0, (currentLevelXp / need) * 100));

  const strongest = (Object.keys(state.stats) as StatKey[]).reduce((a, b) =>
    state.stats[a].level * 100 + state.stats[a].xp >= state.stats[b].level * 100 + state.stats[b].xp
      ? a
      : b,
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
          <div className="relative shrink-0">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="emoji grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-secondary text-4xl transition-transform hover:scale-105 sm:h-20 sm:w-20 sm:text-5xl"
              title={avatarPhotoUrl ? "Сменить эмодзи-аватар" : "Сменить аватар"}
            >
              {avatarPhotoUrl ? (
                <img src={avatarPhotoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                state.avatar
              )}
            </button>
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={avatarUploading}
              onClick={() => avatarFileRef.current?.click()}
              title="Загрузить свою фотографию"
              className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-primary disabled:opacity-50"
            >
              <Camera size={12} />
            </button>
            {avatarPhotoUrl && (
              <button
                type="button"
                onClick={() => onChangeAvatarPhoto(undefined)}
                title="Убрать фото, вернуться к эмодзи"
                className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-destructive"
              >
                <X size={10} />
              </button>
            )}
          </div>
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
                onClick={() => {
                  setNameDraft(state.name);
                  setEditingName(true);
                }}
                className="cursor-pointer truncate text-xl font-semibold sm:text-2xl"
                title="Изменить имя"
              >
                {state.name}
              </h1>
            )}
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              Топ:{" "}
              <span style={{ color: STAT_META[strongest].color }}>
                {STAT_META[strongest].label}
              </span>
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
          <span>
            {currentLevelXp} / {need} XP
          </span>
        </div>
        <ProgressBar value={pct} />
      </div>

      {myCode && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">Твой код друга</div>
            <div className="text-lg font-semibold tracking-widest">{myCode}</div>
          </div>
          <button
            type="button"
            onClick={copyMyCode}
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 hover:bg-background"
          >
            {codeCopied ? "Скопировано ✓" : "Скопировать"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShareOpen(true)}
        className="mt-4 w-full rounded-full border border-border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-secondary"
      >
        📤 Поделиться профилем
      </button>

      {shareOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <ShareCardModal state={state} onClose={() => setShareOpen(false)} />,
          document.body,
        )}

      {pickerOpen && (
        <div className="mt-4 flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              onClick={() => {
                onChangeAvatar(a);
                setPickerOpen(false);
              }}
              className="emoji grid h-11 w-11 place-items-center rounded-xl border border-border bg-secondary text-2xl transition-transform hover:scale-110 hover:border-primary"
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
