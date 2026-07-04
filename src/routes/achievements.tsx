import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useGameState } from "@/lib/use-game-state";
import { STAT_META, type StatKey } from "@/lib/game";
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
  const { state, update, hydrated } = useGameState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hydrated) return null;

  const stats = (Object.keys(state.stats) as StatKey[])
    .map((k) => ({ key: k, total: state.stats[k].level * 100 + state.stats[k].xp }))
    .sort((a, b) => b.total - a.total);

  const completed = state.quests.filter((q) => q.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  function resetAll() {
    if (!confirm("Сбросить весь прогресс? Это нельзя отменить.")) return;
    update(() => ({
      avatar: state.avatar,
      name: state.name,
      totalXp: 0,
      level: 1,
      stats: { strength: { level: 0, xp: 0 }, intellect: { level: 0, xp: 0 }, will: { level: 0, xp: 0 } },
      quests: [],
      completedCount: 0,
    }));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:pt-10">
      <TabNav pathname={pathname} />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Уровень героя" value={state.level} accent="var(--color-primary)" />
          <StatCard label="Общий XP" value={state.totalXp} accent="var(--color-accent)" />
          <StatCard label="Выполнено квестов" value={state.completedCount} accent="var(--will)" />
        </div>

        <section className="card-elevated p-5">
          <h2 className="mb-4 font-display text-lg uppercase tracking-wider">Топ характеристик</h2>
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
                    <span className="text-muted-foreground">
                      Ур. {state.stats[s.key].level} · {s.total} XP
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${pct}%`, backgroundColor: meta.color, boxShadow: `0 0 10px ${meta.color}` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card-elevated p-5">
          <h2 className="mb-4 font-display text-lg uppercase tracking-wider">История квестов</h2>
          {completed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ты ещё не выполнил ни одного квеста. Вперёд!</p>
          ) : (
            <ul className="divide-y divide-border">
              {completed.slice(0, 50).map((q) => {
                const meta = STAT_META[q.stat];
                return (
                  <li key={q.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span>{meta.icon}</span>
                      <span className="truncate">{q.title}</span>
                    </div>
                    <div className="shrink-0 text-xs" style={{ color: meta.color }}>
                      +{q.reward} {meta.label}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <button
          onClick={resetAll}
          className="w-full rounded-md border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          Сбросить прогресс
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="card-elevated p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}
