import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useGameStateContext } from "@/lib/use-game-state-context";
import { NutritionCalculator } from "@/components/NutritionCalculator";
import { LoadingScreen } from "@/components/LoadingScreen";
import { TabNav } from "./index";

export const Route = createFileRoute("/nutrition")({
  head: () => ({
    meta: [
      { title: "Питание — Life RPG" },
      {
        name: "description",
        content: "Калькулятор БЖУ и калорий по простому текстовому описанию еды.",
      },
    ],
  }),
  component: NutritionPage,
});

function NutritionPage() {
  const { state, update, hydrated } = useGameStateContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hydrated) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-4xl px-3 pb-28 pt-4 sm:px-4 sm:pt-8 md:pb-24">
      <TabNav pathname={pathname} />
      <NutritionCalculator state={state} update={update} />
    </div>
  );
}
