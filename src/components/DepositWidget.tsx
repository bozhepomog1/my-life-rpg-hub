import { useEffect, useState } from "react";
import { DEPOSIT_DURATION_MS, computeDiscipline, type GameState } from "@/lib/game";

interface Props {
  state: GameState;
}

function fmt(n: number) {
  return String(n).padStart(2, "0");
}

export function DepositWidget({ state }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const end = state.depositStartAt + DEPOSIT_DURATION_MS;
  const remain = Math.max(0, end - now);
  const days = Math.floor(remain / (24 * 3600 * 1000));
  const hours = Math.floor((remain / (3600 * 1000)) % 24);
  const mins = Math.floor((remain / 60000) % 60);
  const secs = Math.floor((remain / 1000) % 60);

  const { progress, redCount, greenCount, lost } = computeDiscipline(state);
  const active = !lost && remain > 0;

  // Status is conveyed by the dot, not by tinting the text itself — tinted
  // text (muted success/destructive) was too low-contrast to read reliably
  // in the light theme, especially at small sizes.
  const statusColor = lost ? "var(--color-destructive)" : "var(--color-success)";

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Система залога</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-foreground sm:text-4xl">
              ${state.depositAmount}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
              {active ? "Заблокировано" : lost ? "Сгорели" : "Высвобождены"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Прогресс</div>
          <div className="text-2xl font-semibold text-primary sm:text-3xl">{progress}%</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1.5 sm:gap-2">
        {[
          { l: "Дни", v: days },
          { l: "Час", v: hours },
          { l: "Мин", v: mins },
          { l: "Сек", v: secs },
        ].map((u) => (
          <div key={u.l} className="rounded-xl border border-border bg-secondary px-1.5 py-2.5 text-center">
            <div className="text-2xl tabular-nums font-semibold text-foreground sm:text-3xl">{fmt(u.v)}</div>
            <div className="text-[10px] text-muted-foreground">{u.l}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>✓ {greenCount} закрыто</span>
          <span>✕ {redCount} штраф −{redCount * 5}%</span>
        </div>
      </div>

      {lost && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-center text-xs text-destructive">
          Вы проиграли — $1000 сгорели
        </div>
      )}
    </div>
  );
}
