import { useRef, useState } from "react";
import { STAT_META, type Quest } from "@/lib/game";

interface Props {
  quest: Quest;
  onComplete: (id: string, photoData: string | undefined, e?: React.MouseEvent) => void;
  onToggleChecklist?: (questId: string, itemId: string) => void;
  onDelete: (id: string) => void;
  onPhoto: (id: string, data: string) => void;
}

export function QuestCard({ quest, onComplete, onToggleChecklist, onDelete, onPhoto }: Props) {
  const meta = STAT_META[quest.stat];
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);

  const checklistDone = quest.checklist ? quest.checklist.every((c) => c.done) : true;
  const canComplete = (!quest.requiresPhoto || !!quest.photoData) && checklistDone;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // downscale via canvas
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxW = 640;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        onPhoto(quest.id, canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = result;
    };
    reader.readAsDataURL(f);
  }

  return (
    <div
      className="panel corner-cut group relative overflow-hidden p-4 transition-all"
      style={{
        borderColor: quest.done ? `${meta.color}60` : "var(--color-border)",
        opacity: quest.done ? 0.75 : 1,
      }}
    >
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: meta.gradient, boxShadow: `0 0 12px ${meta.glow}` }}
      />
      <div className="flex items-start gap-3 pl-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="font-display text-[10px] tracking-[0.2em]"
              style={{ color: meta.color, textShadow: `0 0 8px ${meta.glow}` }}
            >
              {meta.icon} {meta.label}
            </span>
            {quest.mandatory && (
              <span className="rounded-sm border border-destructive/50 px-1 font-display text-[9px] text-destructive">
                ОБЯЗ.
              </span>
            )}
            <span
              className="ml-auto shrink-0 font-display text-sm"
              style={{ color: meta.color, textShadow: `0 0 8px ${meta.glow}` }}
            >
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
                onClick={() => fileRef.current?.click()}
                className="rounded-md border border-border bg-black/40 px-2.5 py-1 font-display text-[10px] tracking-wider text-muted-foreground hover:text-foreground"
              >
                📷 {quest.photoData ? "Заменить фото" : "Загрузить фото"}
              </button>
              <span className="text-[11px] text-muted-foreground">
                {quest.photoHint || "Требуется подтверждение"}
              </span>
            </div>
          )}
          {quest.photoData && (
            <img
              src={quest.photoData}
              alt=""
              className="mt-2 h-20 rounded-md border border-border object-cover"
            />
          )}

          {quest.checklist && quest.checklist.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="font-display text-[10px] tracking-wider text-muted-foreground hover:text-foreground"
              >
                {expanded ? "▾" : "▸"} ЧЕК-ЛИСТ ({quest.checklist.filter((c) => c.done).length}/{quest.checklist.length})
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

        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            onClick={(e) => !quest.done && canComplete && onComplete(quest.id, quest.photoData, e)}
            disabled={quest.done || !canComplete}
            className="grid h-11 w-11 place-items-center rounded-md border-2 transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              borderColor: quest.done ? meta.color : canComplete ? meta.color : "var(--color-border)",
              background: quest.done ? meta.color : canComplete ? `${meta.color}20` : "transparent",
              color: quest.done ? "#0d0e12" : meta.color,
              boxShadow: canComplete && !quest.done ? `0 0 14px ${meta.glow}` : "none",
            }}
            aria-label="Выполнить"
          >
            <span className="text-lg leading-none">{quest.done ? "✓" : "▶"}</span>
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
