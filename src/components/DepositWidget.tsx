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

  return (
    <div
      className={`panel corner-cut relative overflow-hidden p-4 sm:p-5 ${active ? "animate-pulse-glow" : ""}`}
      style={{
        color: active ? "#22d3ee" : "#ef4444",
        borderColor: active ? "rgba(34,211,238,0.35)" : "rgba(239,68,68,0.5)",
        background:
          "linear-gradient(135deg, rgba(34,211,238,0.06), rgba(240,171,252,0.04)), #14161d",
      }}
    >
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-30" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[10px] tracking-[0.25em] text-muted-foreground">
            СИСТЕМА ЗАЛОГА
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className="font-display text-3xl sm:text-4xl neon-text"
              style={{ color: active ? "#a3e635" : "#ef4444" }}
            >
              ${state.depositAmount}
            </span>
            <span
              className="font-display text-[11px]"
              style={{ color: active ? "#a3e635" : "#ef4444" }}
            >
              {active ? "ЗАБЛОКИРОВАНО" : lost ? "СГОРЕЛИ" : "ВЫСВОБОЖДЕНЫ"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-[10px] tracking-[0.25em] text-muted-foreground">
            ПРОГРЕСС
          </div>
          <div
            className="font-display text-2xl sm:text-3xl neon-text"
            style={{ color: progress >= 100 ? "#a3e635" : progress >= 70 ? "#22d3ee" : "#f59e0b" }}
          >
            {progress}%
          </div>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-4 gap-1.5 sm:gap-2">
        {[
          { l: "ДНИ", v: days },
          { l: "ЧАС", v: hours },
          { l: "МИН", v: mins },
          { l: "СЕК", v: secs },
        ].map((u) => (
          <div
            key={u.l}
            className="rounded-md border border-border bg-black/40 px-1.5 py-2 text-center"
            style={{ borderColor: "rgba(34,211,238,0.2)" }}
          >
            <div
              className="font-display text-2xl sm:text-3xl tabular-nums"
              style={{ color: "#22d3ee", textShadow: "0 0 12px rgba(34,211,238,0.6)" }}
            >
              {fmt(u.v)}
            </div>
            <div className="font-display text-[9px] tracking-[0.2em] text-muted-foreground">
              {u.l}
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-4">
        <div className="bar-track">
          <div
            className="bar-fill"
            style={{
              width: `${progress}%`,
              background:
                progress >= 100
                  ? "linear-gradient(90deg,#4d7c0f,#a3e635,#d9f99d)"
                  : progress >= 70
                    ? "linear-gradient(90deg,#0e7490,#22d3ee,#a5f3fc)"
                    : "linear-gradient(90deg,#b45309,#f59e0b,#fde68a)",
              color: progress >= 100 ? "#a3e635" : progress >= 70 ? "#22d3ee" : "#f59e0b",
            }}
          />
        </div>
        <div className="mt-2 flex justify-between font-display text-[10px] text-muted-foreground">
          <span>
            ✓ {greenCount} <span className="text-[#a3e635]">закрыто</span>
          </span>
          <span>
            ✕ {redCount} <span className="text-destructive">штраф −{redCount * 5}%</span>
          </span>
        </div>
      </div>

      {lost && (
        <div className="relative mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-center font-display text-xs text-destructive">
          ВЫ ПРОИГРАЛИ — $1000 СГОРЕЛИ
        </div>
      )}
    </div>
  );
}
