import { computeBossQuestStatus, type BossQuest, type GameState } from "@/lib/game";
import { ProgressBar } from "@/components/ProgressBar";

interface Props {
  state: GameState;
  bossQuest: BossQuest | null;
}

/** Weekly composite challenge — see BossQuest/generateBossQuest in game.ts.
 * Null only very briefly before the periodic ensureWeekRollover() effect first
 * runs, so this just renders nothing in that split second rather than a
 * loading state. Progress bars are generic (computeBossQuestStatus) so this
 * renders any of the 6 challenge templates without needing to know which. */
export function BossQuestCard({ state, bossQuest }: Props) {
  if (!bossQuest) return null;
  // computeBossQuestStatus is typed as always returning a BossQuestStatus,
  // but a BossQuest reaching this component came out of JSON, not out of
  // TypeScript — so treat the result as possibly-missing anyway rather than
  // trusting the type. Same reasoning as the `if (!bossQuest)` guard above:
  // this component renders on every load, so anything unexpected in the
  // stored state must degrade to "render nothing" instead of taking the
  // whole screen down with an unhandled exception.
  const status = computeBossQuestStatus(state, bossQuest);
  const bars = status?.bars ?? [];
  if (bars.length === 0) return null;

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">🐉 {bossQuest.title}</h3>
        <span className="shrink-0 text-xs font-medium text-primary">
          Награда: +{bossQuest.xpReward} XP · +{bossQuest.goldReward}💰
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{bossQuest.description}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Не успеешь до конца недели — просто сгорит без штрафа, в понедельник появится новое.
      </p>

      <div className="mt-3 space-y-2.5">
        {bars.map((bar) => {
          const pct = bar.target > 0 ? (bar.current / bar.target) * 100 : 0;
          return (
            <div key={bar.label}>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{bar.label}</span>
                <span>
                  {bar.current}/{bar.target}
                </span>
              </div>
              <ProgressBar value={pct} />
            </div>
          );
        })}
      </div>

      {bossQuest.claimed && (
        <div className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-center text-xs text-success">
          Испытание пройдено — награда уже начислена! 🎉
        </div>
      )}
    </div>
  );
}
