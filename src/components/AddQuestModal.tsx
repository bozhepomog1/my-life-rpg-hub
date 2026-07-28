import { useState } from "react";
import { STAT_META, STAT_ORDER, type QuestCategory, type StatKey } from "@/lib/game";

type ProofType = "none" | "photo" | "text";

interface Props {
  category: QuestCategory;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    stat: StatKey;
    reward: number;
    category: QuestCategory;
    requiresPhoto?: boolean;
    requiresText?: boolean;
  }) => void;
  // Pre-fills the form — used by RandomGoalRoller's "Добавить как есть" on
  // "Крупные цели" so the suggested idea's wording lands in the title field
  // as ordinary editable text rather than being saved verbatim, per the
  // request that a rolled idea can still be tweaked before saving.
  initialTitle?: string;
  initialStat?: StatKey;
  initialReward?: number;
}

const PROOF_OPTIONS: { key: ProofType; label: string }[] = [
  { key: "none", label: "Просто отметить" },
  { key: "photo", label: "Фото" },
  { key: "text", label: "Текст" },
];

const MODAL_TITLE: Record<QuestCategory, string> = {
  daily: "Новый ежедневный квест",
  story: "Новая крупная цель",
  purchase: "Новая крупная личная цель",
};

const TITLE_PLACEHOLDER: Record<QuestCategory, string> = {
  daily: "Например: Читать 20 страниц перед сном",
  story: "Например: Пробежать 5 км без остановки",
  purchase: "Например: Найти новый рюкзак",
};

export function AddQuestModal({
  category,
  onClose,
  onCreate,
  initialTitle,
  initialStat,
  initialReward,
}: Props) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [stat, setStat] = useState<StatKey>(initialStat ?? "strength");
  const [reward, setReward] = useState(initialReward ?? 15);
  const [proof, setProof] = useState<ProofType>("none");

  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0 && reward >= 1;

  function submit() {
    if (!canSubmit) return;
    onCreate({
      title: trimmed,
      stat,
      reward: Math.min(100, Math.max(1, Math.round(reward))),
      category,
      requiresPhoto: proof === "photo",
      requiresText: proof === "text",
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel-glow w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={MODAL_TITLE[category]}
      >
        <h3 className="text-lg font-semibold">{MODAL_TITLE[category]}</h3>

        <div className="mt-4">
          <label className="text-xs text-muted-foreground">Название</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={TITLE_PLACEHOLDER[category]}
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="mt-3">
          <label className="text-xs text-muted-foreground">Характеристика</label>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {STAT_ORDER.map((k) => {
              const meta = STAT_META[k];
              const active = stat === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStat(k)}
                  className={`rounded-lg border px-1 py-2 text-center text-[11px] font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                  style={active ? { color: meta.color } : undefined}
                >
                  <div className="text-sm leading-none">{meta.icon}</div>
                  <div className="mt-1">{meta.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {category === "daily" && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Ежедневный квест сбрасывается каждую полночь и учитывается в календаре дисциплины —
            выполняй его каждый день, чтобы не потерять залог.
          </p>
        )}

        <div className="mt-3">
          <label className="text-xs text-muted-foreground">Награда (XP)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={reward}
            onChange={(e) => setReward(Number(e.target.value) || 1)}
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="mt-3">
          <label className="text-xs text-muted-foreground">Подтверждение выполнения</label>
          <div className="mt-1.5 flex gap-1.5">
            {PROOF_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setProof(opt.key)}
                className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                  proof === opt.key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

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
            disabled={!canSubmit}
            onClick={submit}
            className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}
