import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { STAT_META, STAT_ORDER, type QuestIdeaTemplate } from "@/lib/game";

interface Props {
  /** QUEST_IDEA_POOL from game.ts. */
  ideas: QuestIdeaTemplate[];
  onAdd: (template: QuestIdeaTemplate) => void;
}

/**
 * Optional, always-available browsable catalog of ready-made quest ideas on
 * the "Сюжетные" tab (see index.tsx) — this used to be the pool that
 * auto-rotated into "Ежедневные" every day; now it's just a bank of ideas
 * the user can look through and voluntarily add from, nothing is ever added
 * without an explicit tap. Collapsed by default since the pool is large
 * (~30 entries); grouped by characteristic so browsing one stat at a time
 * is easy.
 */
export function QuestIdeaCatalog({ ideas, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  function handleAdd(idea: QuestIdeaTemplate) {
    onAdd(idea);
    setAdded((prev) => new Set(prev).add(idea.title));
  }

  return (
    <div className="mb-3 rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        📚 Каталог идей ({ideas.length})
      </button>

      {open && (
        <div className="max-h-80 space-y-4 overflow-y-auto border-t border-border px-4 py-3">
          {STAT_ORDER.map((stat) => {
            const meta = STAT_META[stat];
            const group = ideas.filter((idea) => idea.stat === stat);
            if (group.length === 0) return null;
            return (
              <div key={stat}>
                <div className="text-xs font-medium" style={{ color: meta.color }}>
                  {meta.icon} {meta.label}
                </div>
                <ul className="mt-1.5 space-y-1">
                  {group.map((idea) => {
                    const isAdded = added.has(idea.title);
                    return (
                      <li
                        key={idea.title}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-secondary"
                      >
                        <span className="min-w-0 flex-1 text-foreground">{idea.title}</span>
                        <span className="shrink-0 text-muted-foreground">+{idea.reward} XP</span>
                        <button
                          type="button"
                          onClick={() => handleAdd(idea)}
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            isAdded
                              ? "border-transparent text-muted-foreground"
                              : "border-primary/40 text-primary hover:bg-primary/10"
                          }`}
                        >
                          {isAdded ? "Добавлено ✓" : "Добавить"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
