import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useGameStateContext } from "@/lib/use-game-state-context";
import { BodyPanel } from "@/components/BodyPanel";
import { LoadingScreen } from "@/components/LoadingScreen";
import { TabNav } from "./index";

export const Route = createFileRoute("/body")({
  head: () => ({
    meta: [
      { title: "Тело — Life RPG" },
      { name: "description", content: "Рост, вес и личные рекорды по силовым упражнениям." },
    ],
  }),
  component: BodyPage,
});

function BodyPage() {
  const { state, update, hydrated } = useGameStateContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hydrated) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-4xl px-3 pb-28 pt-4 sm:px-4 sm:pt-8 md:pb-24">
      <TabNav pathname={pathname} />
      <BodyPanel state={state} update={update} />
    </div>
  );
}
