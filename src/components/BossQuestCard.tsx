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
  const status = computeBossQuestStatus(state, bossQuest);

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
        {status.bars.map((bar) => {
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
