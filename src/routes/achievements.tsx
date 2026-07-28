import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useGameStateContext } from "@/lib/use-game-state-context";
import {
  CATEGORY_META,
  computeDiscipline,
  defaultState,
  STAT_META,
  type StatKey,
} from "@/lib/game";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_CATEGORY_ORDER,
} from "@/lib/achievements";
import { TabNav } from "./index";
import { ProgressBar } from "@/components/ProgressBar";
import { LoadingScreen } from "@/components/LoadingScreen";

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
  const { state, setState, hydrated } = useGameStateContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hydrated) return <LoadingScreen />;

  const stats = (Object.keys(state.stats) as StatKey[])
    .map((k) => ({ key: k, total: state.stats[k].level * 100 + state.stats[k].xp }))
    .sort((a, b) => b.total - a.total);

  const completed = state.quests
    .filter((q) => q.done)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  // Large one-off quests (story/purchase) don't just vanish into the log —
  // they get a dedicated trophy shelf. Daily quests reset every day so they
  // don't belong here.
  const hallOfFame = completed.filter((q) => q.category !== "daily");
  // Won boss quests share the same trophy shelf as big one-off quests —
  // merged into a single timeline sorted newest-first (see bossWins in
  // game.ts, logged by checkBossQuestCompletion on every win).
  type HallEntry =
    | { type: "quest"; at: number; quest: (typeof hallOfFame)[number] }
    | { type: "boss"; at: number; win: (typeof state.bossWins)[number] };
  const hallEntries: HallEntry[] = [
    ...hallOfFame.map((quest): HallEntry => ({ type: "quest", at: quest.completedAt ?? 0, quest })),
    ...state.bossWins.map((win): HallEntry => ({ type: "boss", at: win.wonAt, win })),
  ].sort((a, b) => b.at - a.at);
  const disc = computeDiscipline(state);

  function resetAll() {
    if (!confirm("Сбросить весь прогресс? Это нельзя отменить.")) return;
    setState(defaultState());
  }
  function restartDeposit() {
    if (
      !confirm(`Перезапустить залог? Отсчёт ${state.depositDurationDays} дней начнётся заново.`)
    ) {
      return;
    }
    setState({ ...state, depositStartAt: Date.now(), dailyCompletions: {}, depositLost: false });
  }

  return (
    <div className="mx-auto max-w-4xl px-3 pb-28 pt-4 sm:px-4 sm:pt-8 md:pb-24">
      <TabNav pathname={pathname} />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard label="Уровень героя" value={state.level} />
          <StatCard label="Общий XP" value={state.totalXp} />
          <StatCard label="Квесты" value={state.completedCount} />
          <StatCard label="Прогресс дисциплины" value={`${disc.progress}%`} />
        </div>

        <section className="panel p-6">
          <h2 className="mb-1 text-sm font-semibold">🎖️ Достижения</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {Object.keys(state.unlockedAchievements).length} / {ACHIEVEMENTS.length} разблокировано
          </p>
          <div className="space-y-5">
            {ACHIEVEMENT_CATEGORY_ORDER.map((cat) => {
              const defs = ACHIEVEMENTS.filter((a) => a.category === cat);
              return (
                <div key={cat}>
                  <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
                    {ACHIEVEMENT_CATEGORY_LABELS[cat]}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {defs.map((def) => {
                      const unlockedAt = state.unlockedAchievements[def.id];
                      const progress = def.progress?.(state, {
                        friendsCount: 0,
                        leaderboardTop3: false,
                      });
                      return (
                        <div
                          key={def.id}
                          className={`rounded-xl border p-3 transition-colors ${
                            unlockedAt
                              ? "border-primary/40 bg-primary/5"
                              : "border-border opacity-60"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="text-xl leading-none">{def.icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{def.title}</div>
                              {unlockedAt ? (
                                <div className="mt-0.5 text-[11px] text-primary">
                                  Получено {new Date(unlockedAt).toLocaleDateString("ru-RU")}
                                </div>
                              ) : (
                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                  {def.description}
                                </div>
                              )}
                              {!unlockedAt && progress && progress.target > 1 && (
                                <div className="mt-1.5">
                                  <ProgressBar value={(progress.current / progress.target) * 100} />
                                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                                    {progress.current}/{progress.target}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

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
                      Уровень {state.stats[s.key].level} · {s.total} XP
                    </span>
                  </div>
                  <ProgressBar value={pct} color={meta.color} />
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="mb-1 text-sm font-semibold">🏆 Зал славы</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Крупные разовые квесты и побеждённые босс-квесты недели — остаются здесь навсегда.
          </p>
          {hallEntries.length === 0 ? (
            <div className="py-6 text-center">
              <div className="text-3xl">🏆</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Пока пусто — заверши сюжетный или закупочный квест, или пройди испытание недели, и
                это попадёт в зал славы.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {hallEntries.map((entry) => {
                if (entry.type === "boss") {
                  const date = new Date(entry.win.wonAt);
                  return (
                    <div
                      key={`boss-${entry.win.wonAt}`}
                      className="relative overflow-hidden rounded-xl border border-primary/30 bg-secondary/60 p-4"
                    >
                      <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
                      <div className="flex items-start gap-2 pl-2">
                        <span className="text-2xl leading-none">🐉</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium leading-snug">
                            Босс недели №{entry.win.weekNumber} побеждён
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                            <span>{entry.win.title}</span>
                            <span>· {date.toLocaleDateString("ru-RU")}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                const q = entry.quest;
                const meta = STAT_META[q.stat];
                const date = q.completedAt ? new Date(q.completedAt) : null;
                return (
                  <div
                    key={q.id}
                    className="relative overflow-hidden rounded-xl border border-primary/30 bg-secondary/60 p-4"
                  >
                    <div
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ background: meta.color }}
                    />
                    <div className="flex items-start gap-2 pl-2">
                      <span className="text-2xl leading-none">🏆</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-snug">{q.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>{CATEGORY_META[q.category].icon}</span>
                          <span>{CATEGORY_META[q.category].label}</span>
                          {date && <span>· {date.toLocaleDateString("ru-RU")}</span>}
                          <span style={{ color: meta.color }}>· +{q.reward} XP</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel p-6">
          <h2 className="mb-4 text-sm font-semibold">История квестов</h2>
          {completed.length === 0 ? (
            <div className="py-6 text-center">
              <div className="text-3xl">🏅</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Пока нет выполненных квестов — заверши первый, и он появится здесь.
              </p>
            </div>
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

        <div className={`grid gap-2 ${state.depositEnabled ? "sm:grid-cols-2" : ""}`}>
          {state.depositEnabled && (
            <button
              onClick={restartDeposit}
              className="rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-all hover:-translate-y-0.5 hover:bg-primary/10"
            >
              Перезапустить залог
            </button>
          )}
          <button
            onClick={resetAll}
            className="rounded-full border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-all hover:-translate-y-0.5 hover:bg-destructive/10"
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
