import { useEffect, useState } from "react";
import { depositDurationMs, computeDiscipline, type GameState } from "@/lib/game";
import { ProgressBar } from "@/components/ProgressBar";

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
  const end = state.depositStartAt + depositDurationMs(state);
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
    <div className="panel p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            title={`Ставка на себя: выполняй ежедневные квесты ${state.depositDurationDays} дней подряд, чтобы вернуть эту сумму.`}
          >
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: statusColor }}
            />
            <span className="truncate">
              Залог · {active ? "заблокировано" : lost ? "сгорели" : "высвобождены"}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xl font-semibold text-foreground sm:text-2xl">
              ${state.depositAmount}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {days}д {fmt(hours)}:{fmt(mins)}:{fmt(secs)}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold text-primary sm:text-xl">{progress}%</div>
          <div className="text-[10px] text-muted-foreground">
            ✓{greenCount} ✕{redCount}
          </div>
        </div>
      </div>

      <div className="mt-2.5">
        <ProgressBar value={progress} />
      </div>

      {lost && (
        <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-center text-[11px] text-destructive">
          Вы проиграли — ${state.depositAmount} сгорели
        </div>
      )}
    </div>
  );
}
