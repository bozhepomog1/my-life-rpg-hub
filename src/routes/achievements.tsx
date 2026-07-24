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

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard label="Уровень героя" value={state.level} />
          <StatCard label="Общий XP" value={state.totalXp} />
          <StatCard label="Квесты" value={state.completedCount} />
          <StatCard label="Прогресс залога" value={`${disc.progress}%`} />
        </div>

        <section className="panel p-6">
          <h2 className="mb-4 text-sm font-semibold">Топ характеристик</h2>
          <div className="space-y-3">
            {stats.map((s, i) => {
              const meta = STAT_META[s.key];
              const max = Math.max(1, stats[0].total);
              const pct = (s.total / max) * 100;
              return (
                <div key={s.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">#{i + 1}</span>
                      <span>{meta.icon}</span>
                      <span style={{ color: meta.color }}>{meta.label}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Ур. {state.stats[s.key].level} · {s.total} XP
                    </span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="mb-4 text-sm font-semibold">История квестов</h2>
          {completed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ещё нет выполненных квестов.</p>
          ) : (
            <ul className="divide-y divide-border">
              {completed.slice(0, 100).map((q) => {
                const meta = STAT_META[q.stat];
                return (
                  <li key={q.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span>{meta.icon}</span>
                      <span className="truncate">{q.title}</span>
                    </div>
                    <div className="shrink-0 text-xs font-medium" style={{ color: meta.color }}>
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
            className="rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            Перезапустить залог
          </button>
          <button
            onClick={resetAll}
            className="rounded-full border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            Сбросить прогресс
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="panel p-5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-primary sm:text-3xl">{value}</div>
    </div>
  );
}
