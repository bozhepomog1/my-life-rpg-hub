import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useGameState } from "@/lib/use-game-state";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TabNav } from "./index";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки — Life RPG" },
      {
        name: "description",
        content: "Имя персонажа, залог, резервная копия данных и сброс прогресса.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { state, update, setState, hydrated } = useGameState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hydrated) return null;

  return (
    <div className="mx-auto max-w-4xl px-3 pb-24 pt-4 sm:px-4 sm:pt-8">
      <TabNav pathname={pathname} />
      <SettingsPanel state={state} update={update} setState={setState} />
    </div>
  );
}
