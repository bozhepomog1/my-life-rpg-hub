import { STAT_META, type BossQuest } from "@/lib/game";
import { ProgressBar } from "@/components/ProgressBar";

interface Props {
  bossQuest: BossQuest | null;
}

/** Weekly composite challenge — see BossQuest/generateBossQuest in game.ts.
 * Null only very briefly before the periodic ensureBossQuest() effect first
 * runs, so this just renders nothing in that split second rather than a
 * loading state. */
export function BossQuestCard({ bossQuest }: Props) {
  if (!bossQuest) return null;

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">🐉 {bossQuest.title}</h3>
        <span className="shrink-0 text-xs font-medium text-primary">
          Награда: +{bossQuest.xpReward} XP · +{bossQuest.goldReward}💰
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Испытание недели — не успеешь до конца недели, просто сгорит без штрафа, в понедельник
        появится новое.
      </p>

      <div className="mt-3 space-y-2.5">
        {bossQuest.targets.map((t) => {
          const done = Math.min(bossQuest.progress[t.stat] ?? 0, t.count);
          const pct = t.count > 0 ? (done / t.count) * 100 : 0;
          const meta = STAT_META[t.stat];
          return (
            <div key={t.stat}>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span style={{ color: meta.color }}>
                  {meta.icon} {meta.label}
                </span>
                <span>
                  {done}/{t.count}
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
