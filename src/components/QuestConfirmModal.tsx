import { useRef, useState } from "react";
import { MIN_NOTE_LENGTH, STAT_META, type Quest } from "@/lib/game";

interface Props {
  quest: Quest;
  uploading: boolean;
  photoUrl: string | null;
  onAttachPhoto: (file: File) => void;
  onConfirm: (note?: string) => void;
  onClose: () => void;
}

export function QuestConfirmModal({ quest, uploading, photoUrl, onAttachPhoto, onConfirm, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const meta = STAT_META[quest.stat];

  const photoReady = !quest.requiresPhoto || !!quest.photoPath;
  const noteLength = note.trim().length;
  const textReady = !quest.requiresText || noteLength >= MIN_NOTE_LENGTH;
  const canConfirm = photoReady && textReady && !uploading;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onAttachPhoto(f);
  }

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="panel-glow w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-medium" style={{ color: meta.color }}>
          {meta.icon} {meta.label} · +{quest.reward} XP
        </div>
        <h3 className="mt-1 text-lg font-semibold leading-snug">{quest.title}</h3>

        {quest.requiresPhoto && (
          <div className="mt-4">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              className="hidden"
            />
            {photoUrl ? (
              <div className="flex items-center gap-3">
                <img src={photoUrl} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                >
                  {uploading ? "Загрузка…" : "Заменить фото"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? "Загрузка…" : `📷 ${quest.photoHint || "Прикрепить фото"}`}
              </button>
            )}
          </div>
        )}

        {quest.requiresText && (
          <div className="mt-4">
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Кратко опиши, что уже сделал или узнал…"
              className="w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {noteLength} / {MIN_NOTE_LENGTH}
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(quest.requiresText ? note.trim() : undefined)}
            className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}
