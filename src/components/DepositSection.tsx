import { useState } from "react";
import type { GameState } from "@/lib/game";
import { DepositWidget } from "@/components/DepositWidget";
import { DepositSetupModal } from "@/components/DepositSetupModal";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}

/**
 * Deposit is opt-in: shows the full widget only once the user has actually
 * configured and confirmed one. Otherwise a small, low-commitment prompt
 * card replaces it — no more assuming everyone wants $1000 on the line by
 * default.
 */
export function DepositSection({ state, update }: Props) {
  const [setupOpen, setSetupOpen] = useState(false);

  function confirmSetup(amount: number, durationDays: number) {
    update((s) => ({
      ...s,
      depositEnabled: true,
      depositAmount: amount,
      depositDurationDays: durationDays,
      depositStartAt: Date.now(),
      depositLost: false,
    }));
    setSetupOpen(false);
  }

  if (state.depositEnabled) {
    return <DepositWidget state={state} />;
  }

  return (
    <>
      <div className="panel flex items-center justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">Хочешь мотивацию посерьёзнее?</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Внеси залог, который потеряешь при провале.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="shrink-0 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:-translate-y-0.5 hover:bg-primary/10"
        >
          Настроить залог
        </button>
      </div>

      {setupOpen && (
        <DepositSetupModal
          initialAmount={state.depositAmount}
          initialDurationDays={state.depositDurationDays}
          onConfirm={confirmSetup}
          onCancel={() => setSetupOpen(false)}
        />
      )}
    </>
  );
}
