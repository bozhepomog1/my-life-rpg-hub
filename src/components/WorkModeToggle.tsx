interface Props {
  workMode: boolean;
  onChange: (workMode: boolean) => void;
}

/**
 * Home-screen toggle between "at work" and "day off". Switching takes effect
 * immediately (the quest list re-derives from state.workMode on every
 * render) and persists like any other state change via the existing
 * autosave/cloud-sync pipeline.
 */
export function WorkModeToggle({ workMode, onChange }: Props) {
  return (
    <div className="panel flex items-center gap-1 p-1.5">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-medium transition-colors duration-200 ${
          workMode
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        💼 Я на работе (12ч смена)
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-medium transition-colors duration-200 ${
          !workMode
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        🏖️ Выходной
      </button>
    </div>
  );
}
