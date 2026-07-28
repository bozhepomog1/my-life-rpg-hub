import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useGameStateContext } from "@/lib/use-game-state-context";
import { FriendsPanel } from "@/components/FriendsPanel";
import { TabNav } from "./index";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "Друзья — Life RPG" },
      { name: "description", content: "Друзья и таблица рейтингов по общему опыту." },
    ],
  }),
  component: FriendsPage,
});

function FriendsPage() {
  const { state, update, hydrated } = useGameStateContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hydrated) return null;

  return (
    <div className="mx-auto max-w-4xl px-3 pb-28 pt-4 sm:px-4 sm:pt-8 md:pb-24">
      <TabNav pathname={pathname} />
      <FriendsPanel state={state} update={update} />
    </div>
  );
}
