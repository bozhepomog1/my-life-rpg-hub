import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileHeader } from "@/components/ProfileHeader";
import { StatBar } from "@/components/StatBar";
import { QuestCard } from "@/components/QuestCard";
import { DepositWidget } from "@/components/DepositWidget";
import { DisciplineCalendar } from "@/components/DisciplineCalendar";
import { useGameStateContext } from "@/lib/use-game-state-context";
import {
  applyReward,
  CATEGORY_META,
  computeDiscipline,
  resetDailyIfNeeded,
  STAT_META,
  todayKey,
  type QuestCategory,
  type StatKey,
} from "@/lib/game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Life RPG — Геймификация жизни" },
      {
        name: "description",
        content: "Личный RPG-трекер: квесты, залог $1000 и календарь дисциплины.",
      },
    ],
  }),
  component: Home,
});

interface FloatXp {
  id: number;
  text: string;
  color: string;
  x: number;
  y: number;
}

function Home() {
  const { state, update, hydrated } = useGameStateContext();
  const [floats, setFloats] = useState<FloatXp[]>([]);
  const [levelPulse, setLevelPulse] = useState(false);
  const [tab, setTab] = useState<QuestCategory>("daily");
  const floatId = useRef(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Reset daily quests at midnight
  useEffect(() => {
    if (!hydrated) return;
    update((s) => resetDailyIfNeeded(s));
    const t = setInterval(() => update((s) => resetDailyIfNeeded(s)), 60_000);
    return () => clearInterval(t);
  }, [hydrated, update]);

  const disc = useMemo(() => (hydrated ? computeDiscipline(state) : null), [state, hydrated]);

  function completeQuest(
    id: string,
    _photoPath: string | undefined,
    note: string | undefined,
    e?: React.MouseEvent,
  ) {
    const quest = state.quests.find((q) => q.id === id);
    if (!quest || quest.done) return;
    const meta = STAT_META[quest.stat];
    const rect = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
    const fid = ++floatId.current;
    setFloats((f) => [
      ...f,
      {
        id: fid,
        text: `+${quest.reward} ${meta.label}`,
        color: meta.color,
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top : window.innerHeight / 2,
      },
    ]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== fid)), 1100);

    update((s) => {
      const prev = s.level;
      const rewarded = applyReward(s, quest.stat, quest.reward);
      if (rewarded.level > prev) {
        setTimeout(() => {
          setLevelPulse(true);
          setTimeout(() => setLevelPulse(false), 1500);
        }, 200);
      }
      // record daily completion
      const dailyCompletions = { ...rewarded.dailyCompletions };
      if (quest.category === "daily") {
        const k = todayKey();
        const arr = dailyCompletions[k] ? [...dailyCompletions[k]] : [];
        if (!arr.includes(quest.id)) arr.push(quest.id);
        dailyCompletions[k] = arr;
      }
      return {
        ...rewarded,
        dailyCompletions,
        quests: rewarded.quests.map((q) =>
          q.id === id
            ? {
                ...q,
                done: true,
                completedAt: Date.now(),
                lastResetDate: todayKey(),
                proofNote: note || q.proofNote,
              }
            : q,
        ),
      };
    });
  }

  function togglChecklist(qid: string, itemId: string) {
    update((s) => ({
      ...s,
      quests: s.quests.map((q) =>
        q.id === qid && q.checklist
          ? {
              ...q,
              checklist: q.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
            }
          : q,
      ),
    }));
  }

  function setPhoto(id: string, path: string) {
    update((s) => ({
      ...s,
      quests: s.quests.map((q) => (q.id === id ? { ...q, photoPath: path } : q)),
    }));
  }

  function deleteQuest(id: string) {
    update((s) => ({ ...s, quests: s.quests.filter((q) => q.id !== id) }));
  }

  if (!hydrated) return null;

  const questsByCat = state.quests.filter((q) => q.category === tab);
  const active = questsByCat.filter((q) => !q.done);
  const done = questsByCat.filter((q) => q.done);
  const lost = disc?.lost;

  return (
    <div className="mx-auto max-w-4xl px-3 pb-24 pt-4 sm:px-4 sm:pt-8">
      <TabNav pathname={pathname} />

      <div className="space-y-5 sm:space-y-7">
        <ProfileHeader
          state={state}
          onChangeAvatar={(a) => update((s) => ({ ...s, avatar: a }))}
          onChangeName={(n) => update((s) => ({ ...s, name: n }))}
          levelUpPulse={levelPulse}
        />

        <DepositWidget state={state} />

        <section>
          <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">
            Характеристики
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {(Object.keys(state.stats) as StatKey[]).map((k) => (
              <StatBar key={k} stat={k} level={state.stats[k].level} xp={state.stats[k].xp} />
            ))}
          </div>
        </section>

        <DisciplineCalendar state={state} />

        <section>
          <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">Квесты</h2>
          <div className="mb-3 grid grid-cols-3 gap-1.5 sm:gap-2">
            {(Object.keys(CATEGORY_META) as QuestCategory[]).map((c) => {
              const active = tab === c;
              const meta = CATEGORY_META[c];
              return (
                <button
                  key={c}
                  onClick={() => setTab(c)}
                  className={`rounded-xl border px-2.5 py-2 text-left transition-colors duration-200 ${
                    active ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"
                  }`}
                >
                  <div
                    className={`text-xs font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {meta.icon} {meta.label.replace(" квесты", "")}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                    {meta.description}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {active.length === 0 && done.length === 0 && (
              <div className="panel p-8 text-center">
                <div className="text-3xl">{CATEGORY_META[tab].icon}</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Пока нет квестов в этой категории — начни свой первый!
                </p>
              </div>
            )}
            {active.length === 0 && done.length > 0 && (
              <div className="panel p-6 text-center text-sm text-muted-foreground">
                🏆 Все квесты этой категории выполнены. Легенда.
              </div>
            )}
            {active.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                body={state.body}
                onComplete={completeQuest}
                onToggleChecklist={togglChecklist}
                onDelete={deleteQuest}
                onPhoto={setPhoto}
              />
            ))}
          </div>

          {done.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
                Выполнено ({done.length})
              </h3>
              <div className="space-y-2">
                {done.map((q) => (
                  <QuestCard
                    key={q.id}
                    quest={q}
                    body={state.body}
                    onComplete={() => {}}
                    onToggleChecklist={togglChecklist}
                    onDelete={deleteQuest}
                    onPhoto={setPhoto}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="pointer-events-none fixed inset-0 z-50">
        {floats.map((f) => (
          <div
            key={f.id}
            className="animate-xp-pop absolute text-lg font-semibold"
            style={{ left: f.x, top: f.y, color: f.color, transform: "translate(-50%, -100%)" }}
          >
            {f.text}
          </div>
        ))}
      </div>

      {lost && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="panel-glow max-w-md p-8 text-center">
            <div className="text-xs font-medium tracking-wide text-destructive">Игра окончена</div>
            <div className="mt-2 text-3xl font-semibold text-destructive">Ты проиграл</div>
            <p className="mt-4 text-sm text-muted-foreground">
              $1000 сгорели. Ты не выполнил условия 30-дневного залога.
            </p>
            <Link
              to="/achievements"
              className="mt-6 inline-block rounded-full border border-destructive/40 px-4 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              К достижениям
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function TabNav({ pathname }: { pathname: string }) {
  const tabs = [
    { to: "/", label: "Профиль" },
    { to: "/nutrition", label: "Питание" },
    { to: "/body", label: "Тело" },
    { to: "/achievements", label: "Достижения" },
  ] as const;
  return (
    <div className="mb-4 flex items-center justify-between sm:mb-6">
      <div className="inline-flex rounded-full border border-border bg-secondary p-1">
        {tabs.map((t) => {
          const active = pathname === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          aria-label="Настройки"
          title="Настройки"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-all hover:scale-110 ${
            pathname === "/settings"
              ? "border-primary text-primary"
              : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          }`}
        >
          <Settings size={15} />
        </Link>
        <ThemeToggle />
      </div>
    </div>
  );
}
