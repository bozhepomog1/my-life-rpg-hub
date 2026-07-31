import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useGameStateContext } from "@/lib/use-game-state-context";
import { StatsPanel } from "@/components/StatsPanel";
import { LoadingScreen } from "@/components/LoadingScreen";
import { TabNav } from "./index";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Статистика — Life RPG" },
      {
        name: "description",
        content: "Графики прогресса: XP по дням, квесты по характеристикам, серия дней.",
      },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const { state, hydrated } = useGameStateContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hydrated) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-4xl px-3 pb-28 pt-4 sm:px-4 sm:pt-8 md:pb-24">
      <TabNav pathname={pathname} />
      <StatsPanel state={state} />
    </div>
  );
}
