import type { GameState } from "@/lib/game";
import { DepositWidget } from "@/components/DepositWidget";

interface Props {
  state: GameState;
}

/**
 * Deposit is opt-in and, since this pass, opt-in ONLY through Settings →
 * Игра → «Залог» (see SettingsPanel.tsx) — there used to also be a compact
 * "Хочешь мотивацию посерьёзнее?" prompt card rendered here unconditionally
 * for every user on the main profile screen, which meant the deposit
 * feature still claimed a slice of prime real estate by default even for
 * people who never asked for it. Now this renders the live countdown
 * widget once a deposit is actually active, and nothing at all otherwise —
 * a user who hasn't touched the feature sees zero trace of it on their main
 * screen, exactly like any other opted-out gameplay mechanic.
 */
export function DepositSection({ state }: Props) {
  if (!state.depositEnabled) return null;
  return <DepositWidget state={state} />;
}
