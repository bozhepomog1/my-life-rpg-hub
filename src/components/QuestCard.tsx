import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pin } from "lucide-react";
import { STAT_META, trainingHint, type BodyStats, type Quest } from "@/lib/game";
import { useAuthContext } from "@/lib/use-auth-context";
import { uploadQuestPhoto, getQuestPhotoUrl } from "@/lib/quest-photos";
import { QuestConfirmModal } from "@/components/QuestConfirmModal";

interface Props {
  quest: Quest;
  body: BodyStats;
  onComplete: (
    id: string,
    photoPath: string | undefined,
    note: string | undefined,
    e?: React.MouseEvent,
  ) => void;
  onToggleChecklist?: (questId: string, itemId: string) => void;
  onDelete: (id: string) => void;
  onPhoto: (id: string, path: string) => void;
  // Pin toggle is only offered for user-created story/purchase quests (see
  // sortQuestsForDisplay in game.ts) — daily quests rotate fresh every day
  // and aren't something a user curates by hand, so index.tsx omits this
  // prop for the daily tab.
  onTogglePin?: (id: string) => void;
  // Shop "Отложить на завтра" (daily quests only — see POSTPONE_PRICE_GOLD
  // in game.ts). Omitted entirely outside the daily tab.
  onPostpone?: (id: string) => void;
  canPostpone?: boolean;
  postponePrice?: number;
}

export function QuestCard({
  quest,
  body,
  onComplete,
  onToggleChecklist,
  onDelete,
  onPhoto,
  onTogglePin,
  onPostpone,
  canPostpone,
  postponePrice,
}: Props) {
  const meta = STAT_META[quest.stat];
  const { user } = useAuthContext();
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const checklistDone = quest.checklist ? quest.checklist.every((c) => c.done) : true;
  const canAttempt = !quest.done && checklistDone;
  const needsConfirmModal = quest.requiresPhoto || quest.requiresText;

  const wasDone = useRef(quest.done);
  const [justCompleted, setJustCompleted] = useState(false);
  useEffect(() => {
    if (quest.done && !wasDone.current) {
      setJustCompleted(true);
      wasDone.current = true;
      const t = setTimeout(() => setJustCompleted(false), 600);
      return () => clearTimeout(t);
    }
    wasDone.current = quest.done;
  }, [quest.done]);

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

  async function attachPhoto(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const path = await uploadQuestPhoto(user.id, quest.id, file);
      onPhoto(quest.id, path);
    } catch (err) {
      console.warn("photo upload failed", err);
    } finally {
      setUploading(false);
    }
  }

  function handleMainClick(e: React.MouseEvent) {
    if (!canAttempt) return;
    if (needsConfirmModal) {
      setModalOpen(true);
    } else {
      onComplete(quest.id, quest.photoPath, undefined, e);
    }
  }

  function handleConfirm(note?: string) {
    onComplete(quest.id, quest.photoPath, note);
    setModalOpen(false);
  }

  return (
    <div
      className={`panel group relative overflow-hidden p-5 transition-opacity ${justCompleted ? "animate-quest-complete" : ""} ${quest.pinned ? "ring-1 ring-primary/50" : ""}`}
      style={{ opacity: quest.done ? 0.6 : 1 }}
    >
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: meta.color }} />
      <div className="pl-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: meta.color }}>
            {meta.icon} {meta.label}
          </span>
          {quest.mandatory && (
            <span className="rounded-full border border-destructive/40 px-1.5 py-0.5 text-[10px] text-destructive">
              Обязательно
            </span>
          )}
          {quest.bonus && (
            <span className="rounded-full border border-accent-2/40 px-1.5 py-0.5 text-[10px] text-accent-2">
              ×1.5
            </span>
          )}
          {quest.pinned && (
            <span className="flex items-center gap-1 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary">
              <Pin size={10} className="fill-current" /> Важно
            </span>
          )}
          {onTogglePin && (
            <button
              type="button"
              onClick={() => onTogglePin(quest.id)}
              aria-label={quest.pinned ? "Открепить квест" : "Закрепить квест как важный"}
              title={quest.pinned ? "Открепить" : "Закрепить как важное"}
              className={`ml-auto shrink-0 rounded-full p-1 transition-colors ${
                quest.pinned
                  ? "text-primary"
                  : "text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100"
              }`}
            >
              <Pin size={14} className={quest.pinned ? "fill-current" : ""} />
            </button>
          )}
          <span
            className={`${onTogglePin ? "" : "ml-auto"} shrink-0 text-sm font-medium text-primary`}
          >
            +{quest.reward} XP
          </span>
        </div>
        <h4
          className={`mt-1 text-sm sm:text-base leading-snug ${quest.done ? "line-through text-muted-foreground" : ""}`}
        >
          {quest.title}
        </h4>

        {(quest.requiresPhoto || quest.requiresText) && !quest.done && (
          <p className="mt-1 text-xs text-muted-foreground">
            {quest.requiresPhoto
              ? "Нажми «Выполнить», чтобы прикрепить фото-подтверждение"
              : "Нажми «Выполнить», чтобы описать, что уже сделал"}
          </p>
        )}

        {!quest.done &&
          (() => {
            const hint = trainingHint(quest, body);
            return hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null;
          })()}

        {photoUrl && (
          <img
            src={photoUrl}
            alt=""
            className="mt-2 h-20 rounded-lg border border-border object-cover"
          />
        )}
        {quest.proofNote && (
          <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            {quest.proofNote}
          </p>
        )}

        {quest.checklist && quest.checklist.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? "▾" : "▸"} Чек-лист ({quest.checklist.filter((c) => c.done).length}/
              {quest.checklist.length})
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

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onDelete(quest.id)}
              className="text-xs text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              aria-label="Удалить квест"
            >
              Удалить
            </button>
            {onPostpone && !quest.done && (
              <button
                onClick={() => onPostpone(quest.id)}
                disabled={!canPostpone}
                title={
                  canPostpone
                    ? `Снять этот квест с сегодняшнего списка без штрафа — появится завтра. Стоит ${postponePrice ?? ""}💰, без XP/золота за него.`
                    : "Недостаточно золота или лимит откладываний на сегодня исчерпан"
                }
                // Used to be opacity-0 + group-hover:opacity-100, like
                // "Удалить" — invisible until the card is hovered. That's a
                // dead end on touch screens (no persistent :hover), which is
                // most of this app's actual usage, so the shop's promise of
                // "a button right on every unfinished daily quest" was true
                // on desktop-with-a-mouse only. Always visible now, just
                // dimmed (not hidden) while disabled.
                className="text-xs text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Отложить ({postponePrice ?? ""}💰) →
              </button>
            )}
          </div>
          <button
            onClick={handleMainClick}
            disabled={quest.done || !checklistDone}
            className="flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor:
                quest.done || checklistDone ? "var(--color-primary)" : "var(--color-border)",
              background: quest.done ? "var(--color-primary)" : "transparent",
              color: quest.done ? "var(--color-primary-foreground)" : "var(--color-primary)",
            }}
          >
            <span className="leading-none">{quest.done ? "✓" : "▶"}</span>
            <span>{quest.done ? "Выполнено" : "Выполнить"}</span>
          </button>
        </div>
      </div>

      {modalOpen &&
        createPortal(
          <QuestConfirmModal
            quest={quest}
            uploading={uploading}
            photoUrl={photoUrl}
            onAttachPhoto={attachPhoto}
            onConfirm={handleConfirm}
            onClose={() => setModalOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
}
