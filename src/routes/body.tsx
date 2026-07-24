import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useGameState } from "@/lib/use-game-state";
import { BodyPanel } from "@/components/BodyPanel";
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
  const { state, update, hydrated } = useGameState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hydrated) return null;

  return (
    <div className="mx-auto max-w-4xl px-3 pb-24 pt-4 sm:px-4 sm:pt-8">
      <TabNav pathname={pathname} />
      <BodyPanel state={state} update={update} />
    </div>
  );
}
