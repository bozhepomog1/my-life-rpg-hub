import { useEffect, useRef, useState } from "react";
import { STAT_META, type Quest } from "@/lib/game";
import { useAuthContext } from "@/lib/auth-context";
import { uploadQuestPhoto, getQuestPhotoUrl } from "@/lib/quest-photos";

interface Props {
  quest: Quest;
  onComplete: (id: string, photoPath: string | undefined, e?: React.MouseEvent) => void;
  onToggleChecklist?: (questId: string, itemId: string) => void;
  onDelete: (id: string) => void;
  onPhoto: (id: string, path: string) => void;
}

export function QuestCard({ quest, onComplete, onToggleChecklist, onDelete, onPhoto }: Props) {
  const meta = STAT_META[quest.stat];
  const { user } = useAuthContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const checklistDone = quest.checklist ? quest.checklist.every((c) => c.done) : true;
  const canComplete = (!quest.requiresPhoto || !!quest.photoPath) && checklistDone;

  useEffect(() => {
    let cancelled = false;
    if (!quest.photoPath) {
      setPhotoUrl(null);
      return;
    }
    getQuestPhotoUrl(quest.photoPath).then((url) => {
      if (!cancelled) setPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [quest.photoPath]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setUploading(true);
    try {
      const path = await uploadQuestPhoto(user.id, quest.id, f);
      onPhoto(quest.id, path);
    } catch (err) {
      console.warn("photo upload failed", err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className="panel group relative overflow-hidden p-5 transition-opacity"
      style={{ opacity: quest.done ? 0.6 : 1 }}
    >
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: meta.color }} />
      <div className="flex items-start gap-3 pl-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: meta.color }}>
              {meta.icon} {meta.label}
            </span>
            {quest.mandatory && (
              <span className="rounded-full border border-destructive/40 px-1.5 py-0.5 text-[10px] text-destructive">
                Обязательно
              </span>
            )}
            <span className="ml-auto shrink-0 text-sm font-medium text-primary">
              +{quest.reward} XP
            </span>
          </div>
          <h4 className={`mt-1 text-sm sm:text-base leading-snug ${quest.done ? "line-through text-muted-foreground" : ""}`}>
            {quest.title}
          </h4>

          {quest.requiresPhoto && !quest.done && (
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFile}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                📷 {uploading ? "Загрузка…" : quest.photoPath ? "Заменить фото" : "Загрузить фото"}
              </button>
              <span className="text-xs text-muted-foreground">
                {quest.photoHint || "Требуется подтверждение"}
              </span>
            </div>
          )}
          {photoUrl && (
            <img
              src={photoUrl}
              alt=""
              className="mt-2 h-20 rounded-lg border border-border object-cover"
            />
          )}

          {quest.checklist && quest.checklist.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {expanded ? "▾" : "▸"} Чек-лист ({quest.checklist.filter((c) => c.done).length}/{quest.checklist.length})
              </button>
              {expanded && (
                <ul className="mt-2 space-y-1">
                  {quest.checklist.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={c.done}
                          onChange={() => onToggleChecklist?.(quest.id, c.id)}
                          className="h-4 w-4 accent-primary"
                          disabled={quest.done}
                        />
                        <span className={c.done ? "line-through text-muted-foreground" : ""}>
                          {c.text}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            onClick={(e) => !quest.done && canComplete && onComplete(quest.id, quest.photoPath, e)}
            disabled={quest.done || !canComplete}
            className="grid h-10 w-10 place-items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              borderColor: quest.done || canComplete ? "var(--color-primary)" : "var(--color-border)",
              background: quest.done ? "var(--color-primary)" : "transparent",
              color: quest.done ? "var(--color-primary-foreground)" : "var(--color-primary)",
            }}
            aria-label="Выполнить"
          >
            <span className="text-base leading-none">{quest.done ? "✓" : "▶"}</span>
          </button>
          <button
            onClick={() => onDelete(quest.id)}
            className="text-xs text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
            aria-label="Удалить"
          >
            удалить
          </button>
        </div>
      </div>
    </div>
  );
}
