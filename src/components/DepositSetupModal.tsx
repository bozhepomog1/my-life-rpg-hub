import { useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  initialAmount: number;
  initialDurationDays: number;
  onConfirm: (amount: number, durationDays: number) => void;
  onCancel: () => void;
}

/**
 * Setup form for the (optional) deposit challenge. Opened only from
 * Settings → Игра → «Залог» — both the initial "Настроить залог" button and
 * the "Изменить" button once a deposit is already active use this same
 * form. There is no entry point anywhere on the main screen; a user who
 * hasn't visited Settings and turned this on never sees it. Amount and
 * duration are entirely up to the user: the amount doesn't have to
 * represent real money (nothing is ever actually charged — see the
 * disclaimer in the JSX below), and the duration isn't locked to 30 days.
 */
export function DepositSetupModal({
  initialAmount,
  initialDurationDays,
  onConfirm,
  onCancel,
}: Props) {
  const [amount, setAmount] = useState(String(initialAmount || 1000));
  const [days, setDays] = useState(String(initialDurationDays || 30));

  const parsedAmount = Math.max(0, Math.round(Number(amount) || 0));
  const parsedDays = Math.min(365, Math.max(1, Math.round(Number(days) || 0)));
  const valid = amount.trim() !== "" && days.trim() !== "" && Number(days) >= 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="panel-glow w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Настроить залог"
      >
        <h3 className="text-sm font-semibold">Настроить залог</h3>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Это символический трекер обязательства внутри игры — не настоящие деньги. Укажи любую
          цифру, какая мотивирует именно тебя: ничего не списывается ни с карты, ни откуда-либо ещё,
          это просто личная ставка на себя, которую видишь только ты.
        </p>

        <label
          className="mt-4 block text-xs font-medium text-muted-foreground"
          htmlFor="deposit-amount"
        >
          Сумма залога
        </label>
        <input
          id="deposit-amount"
          type="number"
          min={0}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1000"
          className="mt-1.5 w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary"
        />

        <label
          className="mt-4 block text-xs font-medium text-muted-foreground"
          htmlFor="deposit-duration"
        >
          Длительность (дней)
        </label>
        <input
          id="deposit-duration"
          type="number"
          min={1}
          max={365}
          inputMode="numeric"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="30"
          className="mt-1.5 w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary"
        />

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onConfirm(parsedAmount, parsedDays)}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
