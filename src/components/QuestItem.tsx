import { STAT_META, type Quest } from "@/lib/game";

interface Props {
  quest: Quest;
  onToggle: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string) => void;
}

export function QuestItem({ quest, onToggle, onDelete }: Props) {
  const meta = STAT_META[quest.stat];
  return (
    <div
      className={`card-elevated group flex items-center gap-3 p-3 transition-all ${
        quest.done ? "opacity-60" : "hover:-translate-y-0.5"
      }`}
    >
      <button
        onClick={() => !quest.done && onToggle(quest.id)}
        disabled={quest.done}
        className="relative grid h-8 w-8 shrink-0 place-items-center rounded-md border-2 transition-colors"
        style={{
          borderColor: quest.done ? meta.color : "var(--color-border)",
          backgroundColor: quest.done ? meta.color : "transparent",
        }}
        aria-label="Выполнено"
      >
        {quest.done && <span className="text-background text-lg leading-none">✓</span>}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm sm:text-base ${quest.done ? "line-through" : ""}`}>
          {quest.title}
        </div>
        <div className="flex items-center gap-1 text-xs" style={{ color: meta.color }}>
          <span>{meta.icon}</span>
          <span>+{quest.reward} к {meta.label}</span>
        </div>
      </div>
      <button
        onClick={() => onDelete(quest.id)}
        className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        aria-label="Удалить"
      >
        ✕
      </button>
    </div>
  );
}
