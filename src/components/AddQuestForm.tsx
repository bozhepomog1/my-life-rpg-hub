import { useState } from "react";
import { STAT_META, type StatKey } from "@/lib/game";

interface Props {
  onAdd: (title: string, stat: StatKey, reward: number) => void;
  onCancel: () => void;
}

export function AddQuestForm({ onAdd, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [stat, setStat] = useState<StatKey>("strength");
  const [reward, setReward] = useState(5);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onAdd(t, stat, reward);
    setTitle("");
    setReward(5);
  }

  return (
    <form onSubmit={submit} className="card-elevated space-y-3 p-4 animate-in fade-in slide-in-from-top-2">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Название квеста</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Сходить на турник"
          className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Характеристика</label>
          <div className="flex gap-1">
            {(Object.keys(STAT_META) as StatKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setStat(k)}
                className="flex-1 rounded-md border px-2 py-2 text-sm transition-colors"
                style={{
                  borderColor: stat === k ? STAT_META[k].color : "var(--color-border)",
                  color: stat === k ? STAT_META[k].color : "var(--color-muted-foreground)",
                  backgroundColor: stat === k ? "oklch(0 0 0 / 0.2)" : "transparent",
                }}
                title={STAT_META[k].label}
              >
                {STAT_META[k].icon}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
            Награда: <span className="text-foreground">+{reward}</span>
          </label>
          <input
            type="range"
            min={1}
            max={25}
            value={reward}
            onChange={(e) => setReward(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-md bg-primary px-4 py-2 font-display text-sm uppercase tracking-wider text-primary-foreground hover:brightness-110"
        >
          Добавить
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
