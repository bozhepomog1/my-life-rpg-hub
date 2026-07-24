import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useGameStateContext } from "@/lib/use-game-state-context";
import { NutritionCalculator } from "@/components/NutritionCalculator";
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

  if (!hydrated) return null;

  return (
    <div className="mx-auto max-w-4xl px-3 pb-24 pt-4 sm:px-4 sm:pt-8">
      <TabNav pathname={pathname} />
      <NutritionCalculator state={state} update={update} />
    </div>
  );
}
