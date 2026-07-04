import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useGameState } from "@/lib/use-game-state";
import { computeDiscipline, defaultState, STAT_META, type StatKey } from "@/lib/game";
import { TabNav } from "./index";

export const Route = createFileRoute("/achievements")({
  head: () => ({
    meta: [
      { title: "Мои достижения — Life RPG" },
      { name: "description", content: "Статистика выполненных квестов и прокачки характеристик." },
    ],
  }),
  component: Achievements,
});

function Achievements() {
  const { state, setState, hydrated } = useGameState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hydrated) return null;

  const stats = (Object.keys(state.stats) as StatKey[])
    .map((k) => ({ key: k, total: state.stats[k].level * 100 + state.stats[k].xp }))
    .sort((a, b) => b.total - a.total);

  const completed = state.quests.filter((q) => q.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const disc = computeDiscipline(state);

  function resetAll() {
    if (!confirm("Сбросить весь прогресс? Это нельзя отменить.")) return;
    setState(defaultState());
  }
  function restartDeposit() {
    if (!confirm("Перезапустить залог? Отсчёт 30 дней начнётся заново.")) return;
    setState({ ...state, depositStartAt: Date.now(), dailyCompletions: {}, depositLost: false });
  }

  return (
    <div className="mx-auto max-w-4xl px-3 pb-24 pt-4 sm:px-4 sm:pt-8">
      <TabNav pathname={pathname} />

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <StatCard label="Уровень героя" value={state.level} accent="#22d3ee" />
          <StatCard label="Общий XP" value={state.totalXp} accent="#f0abfc" />
          <StatCard label="Квесты" value={state.completedCount} accent="#a3e635" />
          <StatCard label="Прогресс залога" value={`${disc.progress}%`} accent="#f59e0b" />
        </div>

        <section className="panel p-5">
          <h2 className="mb-4 font-display text-sm tracking-[0.25em]" style={{ color: "#22d3ee" }}>
            ТОП ХАРАКТЕРИСТИК
          </h2>
          <div className="space-y-3">
            {stats.map((s, i) => {
              const meta = STAT_META[s.key];
              const max = Math.max(1, stats[0].total);
              const pct = (s.total / max) * 100;
              return (
                <div key={s.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-display text-muted-foreground">#{i + 1}</span>
                      <span>{meta.icon}</span>
                      <span style={{ color: meta.color }}>{meta.label}</span>
                    </span>
                    <span className="font-display text-xs text-muted-foreground">
                      LV {state.stats[s.key].level} · {s.total} XP
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${pct}%`, background: meta.gradient, color: meta.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-4 font-display text-sm tracking-[0.25em]" style={{ color: "#22d3ee" }}>
            ИСТОРИЯ КВЕСТОВ
          </h2>
          {completed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ещё нет выполненных квестов.</p>
          ) : (
            <ul className="divide-y divide-border">
              {completed.slice(0, 100).map((q) => {
                const meta = STAT_META[q.stat];
                return (
                  <li key={q.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span>{meta.icon}</span>
                      <span className="truncate">{q.title}</span>
                    </div>
                    <div className="shrink-0 font-display text-[11px]" style={{ color: meta.color }}>
                      +{q.reward}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={restartDeposit}
            className="rounded-md border px-4 py-2 font-display text-xs tracking-wider"
            style={{ borderColor: "rgba(34,211,238,0.4)", color: "#22d3ee" }}
          >
            ПЕРЕЗАПУСТИТЬ ЗАЛОГ
          </button>
          <button
            onClick={resetAll}
            className="rounded-md border border-destructive/40 px-4 py-2 font-display text-xs tracking-wider text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            СБРОСИТЬ ПРОГРЕСС
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div
      className="panel corner-cut p-4"
      style={{ borderColor: `${accent}40`, boxShadow: `0 0 20px -8px ${accent}` }}
    >
      <div className="font-display text-[10px] tracking-[0.2em] text-muted-foreground">{label}</div>
      <div
        className="mt-1 font-display text-2xl sm:text-3xl neon-text"
        style={{ color: accent }}
      >
        {value}
      </div>
    </div>
  );
}
