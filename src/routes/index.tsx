import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ProfileHeader } from "@/components/ProfileHeader";
import { StatBar } from "@/components/StatBar";
import { QuestItem } from "@/components/QuestItem";
import { AddQuestForm } from "@/components/AddQuestForm";
import { useGameState } from "@/lib/use-game-state";
import { applyReward, STAT_META, type StatKey } from "@/lib/game";

export const Route = createFileRoute("/")({
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
  const { state, update, hydrated } = useGameState();
  const [showForm, setShowForm] = useState(false);
  const [floats, setFloats] = useState<FloatXp[]>([]);
  const [levelPulse, setLevelPulse] = useState(false);
  const floatId = useRef(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const activeQuests = state.quests.filter((q) => !q.done);
  const doneToday = state.quests.filter((q) => q.done);

  function addQuest(title: string, stat: StatKey, reward: number) {
    update((s) => ({
      ...s,
      quests: [
        { id: crypto.randomUUID(), title, stat, reward, done: false, createdAt: Date.now() },
        ...s.quests,
      ],
    }));
    setShowForm(false);
  }

  function toggleQuest(id: string, e?: React.MouseEvent) {
    const quest = state.quests.find((q) => q.id === id);
    if (!quest || quest.done) return;
    const meta = STAT_META[quest.stat];

    // spawn floating xp near the click
    const rect = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
    const id2 = ++floatId.current;
    setFloats((f) => [
      ...f,
      {
        id: id2,
        text: `+${quest.reward} ${meta.label}`,
        color: meta.color,
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top : window.innerHeight / 2,
      },
    ]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id2)), 1000);

    update((s) => {
      const prevLevel = s.level;
      const withReward = applyReward(s, quest.stat, quest.reward);
      if (withReward.level > prevLevel) {
        setTimeout(() => {
          setLevelPulse(true);
          setTimeout(() => setLevelPulse(false), 700);
        }, 200);
      }
      return {
        ...withReward,
        quests: withReward.quests.map((q) =>
          q.id === id ? { ...q, done: true, completedAt: Date.now() } : q
        ),
      };
    });
  }

  function deleteQuest(id: string) {
    update((s) => ({ ...s, quests: s.quests.filter((q) => q.id !== id) }));
  }

  useEffect(() => {
    // no-op: hydration handled by hook
  }, []);

  if (!hydrated) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:pt-10">
      <TabNav pathname={pathname} />

      <div className="space-y-6">
        <ProfileHeader
          state={state}
          onChangeAvatar={(a) => update((s) => ({ ...s, avatar: a }))}
          onChangeName={(n) => update((s) => ({ ...s, name: n }))}
          levelUpPulse={levelPulse}
        />

        <section>
          <h2 className="mb-3 font-display text-lg uppercase tracking-wider text-muted-foreground">
            Характеристики
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(Object.keys(state.stats) as StatKey[]).map((k) => (
              <StatBar key={k} stat={k} level={state.stats[k].level} xp={state.stats[k].xp} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg uppercase tracking-wider text-muted-foreground">
              Квесты на сегодня
            </h2>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="rounded-md bg-primary px-3 py-1.5 font-display text-xs uppercase tracking-wider text-primary-foreground hover:brightness-110"
              >
                + Добавить квест
              </button>
            )}
          </div>

          {showForm && <AddQuestForm onAdd={addQuest} onCancel={() => setShowForm(false)} />}

          <div className="mt-3 space-y-2">
            {activeQuests.length === 0 && !showForm && (
              <div className="card-elevated p-6 text-center text-sm text-muted-foreground">
                Нет активных квестов. Добавь первый и начни прокачку!
              </div>
            )}
            {activeQuests.map((q) => (
              <QuestItem key={q.id} quest={q} onToggle={toggleQuest} onDelete={deleteQuest} />
            ))}
          </div>

          {doneToday.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Выполнено ({doneToday.length})
              </h3>
              <div className="space-y-2">
                {doneToday.map((q) => (
                  <QuestItem key={q.id} quest={q} onToggle={() => {}} onDelete={deleteQuest} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* floating xp popups */}
      <div className="pointer-events-none fixed inset-0 z-50">
        {floats.map((f) => (
          <div
            key={f.id}
            className="animate-xp-pop absolute font-display text-lg font-bold"
            style={{ left: f.x, top: f.y, color: f.color, transform: "translate(-50%, -100%)" }}
          >
            {f.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TabNav({ pathname }: { pathname: string }) {
  const tabs = [
    { to: "/", label: "Профиль" },
    { to: "/achievements", label: "Достижения" },
  ] as const;
  return (
    <div className="mb-6 flex gap-2">
      {tabs.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className="rounded-full border px-4 py-1.5 font-display text-xs uppercase tracking-wider transition-colors"
            style={{
              borderColor: active ? "var(--color-primary)" : "var(--color-border)",
              color: active ? "var(--color-primary)" : "var(--color-muted-foreground)",
              backgroundColor: active ? "oklch(0 0 0 / 0.25)" : "transparent",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
