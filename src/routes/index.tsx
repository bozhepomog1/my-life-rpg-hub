import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProfileHeader } from "@/components/ProfileHeader";
import { StatBar } from "@/components/StatBar";
import { QuestCard } from "@/components/QuestCard";
import { DepositWidget } from "@/components/DepositWidget";
import { DisciplineCalendar } from "@/components/DisciplineCalendar";
import { useGameState } from "@/lib/use-game-state";
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
      { name: "description", content: "Личный RPG-трекер: квесты, залог $1000 и календарь дисциплины." },
    ],
  }),
  component: Home,
});

interface FloatXp { id: number; text: string; color: string; x: number; y: number }

function Home() {
  const { state, update, hydrated } = useGameState();
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

  function completeQuest(id: string, _photoPath: string | undefined, e?: React.MouseEvent) {
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
        setTimeout(() => { setLevelPulse(true); setTimeout(() => setLevelPulse(false), 700); }, 200);
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
          q.id === id ? { ...q, done: true, completedAt: Date.now(), lastResetDate: todayKey() } : q
        ),
      };
    });
  }

  function togglChecklist(qid: string, itemId: string) {
    update((s) => ({
      ...s,
      quests: s.quests.map((q) =>
        q.id === qid && q.checklist
          ? { ...q, checklist: q.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)) }
          : q
      ),
    }));
  }

  function setPhoto(id: string, path: string) {
    update((s) => ({ ...s, quests: s.quests.map((q) => (q.id === id ? { ...q, photoPath: path } : q)) }));
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

      <div className="space-y-4 sm:space-y-6">
        <ProfileHeader
          state={state}
          onChangeAvatar={(a) => update((s) => ({ ...s, avatar: a }))}
          onChangeName={(n) => update((s) => ({ ...s, name: n }))}
          levelUpPulse={levelPulse}
        />

        <DepositWidget state={state} />

        <section>
          <h2 className="mb-3 font-display text-xs tracking-[0.25em] text-muted-foreground">
            ХАРАКТЕРИСТИКИ
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            {(Object.keys(state.stats) as StatKey[]).map((k) => (
              <StatBar key={k} stat={k} level={state.stats[k].level} xp={state.stats[k].xp} />
            ))}
          </div>
        </section>

        <DisciplineCalendar state={state} />

        <section>
          <h2 className="mb-3 font-display text-xs tracking-[0.25em] text-muted-foreground">
            КВЕСТЫ
          </h2>
          <div className="mb-3 grid grid-cols-3 gap-1.5 sm:gap-2">
            {(Object.keys(CATEGORY_META) as QuestCategory[]).map((c) => {
              const active = tab === c;
              const meta = CATEGORY_META[c];
              return (
                <button
                  key={c}
                  onClick={() => setTab(c)}
                  className="rounded-md border px-2 py-2 text-left transition-all"
                  style={{
                    borderColor: active ? "#22d3ee" : "var(--color-border)",
                    background: active ? "rgba(34,211,238,0.08)" : "transparent",
                    boxShadow: active ? "0 0 14px rgba(34,211,238,0.25)" : "none",
                  }}
                >
                  <div className="font-display text-[10px] tracking-wider" style={{ color: active ? "#22d3ee" : "var(--color-muted-foreground)" }}>
                    {meta.icon} {meta.label.replace(" квесты", "")}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
                    {meta.description}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-2.5">
            {active.length === 0 && (
              <div className="panel p-6 text-center text-sm text-muted-foreground">
                Все квесты этой категории выполнены. Легенда.
              </div>
            )}
            {active.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                onComplete={completeQuest}
                onToggleChecklist={togglChecklist}
                onDelete={deleteQuest}
                onPhoto={setPhoto}
              />
            ))}
          </div>

          {done.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 font-display text-[11px] tracking-[0.25em] text-muted-foreground">
                ВЫПОЛНЕНО ({done.length})
              </h3>
              <div className="space-y-2">
                {done.map((q) => (
                  <QuestCard
                    key={q.id}
                    quest={q}
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
            className="animate-xp-pop absolute font-display text-lg font-bold neon-text"
            style={{ left: f.x, top: f.y, color: f.color, transform: "translate(-50%, -100%)" }}
          >
            {f.text}
          </div>
        ))}
      </div>

      {lost && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-6 backdrop-blur">
          <div className="panel-glow max-w-md p-8 text-center" style={{ borderColor: "rgba(239,68,68,0.6)" }}>
            <div className="font-display text-xs tracking-[0.3em] text-destructive">GAME OVER</div>
            <div className="mt-2 font-display text-4xl neon-text text-destructive">ВЫ ПРОИГРАЛИ</div>
            <p className="mt-4 text-sm text-muted-foreground">
              $1000 сгорели. Ты не выполнил условия 30-дневного залога.
            </p>
            <Link
              to="/achievements"
              className="mt-6 inline-block rounded-md border border-destructive/50 px-4 py-2 font-display text-xs tracking-wider text-destructive hover:bg-destructive/10"
            >
              К ДОСТИЖЕНИЯМ
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
    { to: "/achievements", label: "Достижения" },
  ] as const;
  return (
    <div className="mb-4 flex gap-2 sm:mb-6">
      {tabs.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className="rounded-md border px-4 py-1.5 font-display text-[11px] tracking-wider transition-all"
            style={{
              borderColor: active ? "#22d3ee" : "var(--color-border)",
              color: active ? "#22d3ee" : "var(--color-muted-foreground)",
              background: active ? "rgba(34,211,238,0.08)" : "transparent",
              boxShadow: active ? "0 0 14px rgba(34,211,238,0.3)" : "none",
              textShadow: active ? "0 0 8px rgba(34,211,238,0.6)" : "none",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
