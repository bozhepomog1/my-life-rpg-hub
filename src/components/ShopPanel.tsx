import {
  AVATAR_FRAMES,
  buyCardTheme,
  buyCheatMealBonus,
  buyFrame,
  buyTitle,
  canBuyCheatMealBonus,
  CARD_THEMES,
  CHEAT_MEAL_BONUS_MAX_PER_MONTH,
  CHEAT_MEAL_BONUS_PRICE,
  cheatMealBonusThisMonth,
  equipCardTheme,
  equipFrame,
  equipTitle,
  ownsCardTheme,
  ownsFrame,
  ownsTitle,
  RARITY_COLOR,
  RARITY_LABEL,
  TITLES,
  type AvatarFrame,
  type CardTheme,
  type Title,
} from "@/lib/shop";
import { POSTPONE_DAILY_LIMIT, POSTPONE_PRICE_GOLD, type GameState } from "@/lib/game";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}

export function ShopPanel({ state, update }: Props) {
  return (
    <div className="space-y-5">
      <section className="panel-glow flex items-center justify-between p-5">
        <div>
          <h2 className="text-sm font-semibold">Магазин</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Трать накопленное золото на косметику и удобства — на прогресс это не влияет.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-border bg-secondary px-4 py-2 text-right">
          <div className="text-[11px] tracking-wide text-muted-foreground">Золото</div>
          <div className="text-xl font-semibold text-primary">💰 {state.gold}</div>
        </div>
      </section>

      <section className="panel p-6">
        <h3 className="text-sm font-semibold">Рамки аватара</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Чисто визуальные — обрамление вокруг твоего аватара на главном экране.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {AVATAR_FRAMES.filter((f) => !f.exclusive).map((f) => (
            <FrameRow
              key={f.id}
              item={f}
              owned={ownsFrame(state, f.id)}
              equipped={state.equippedFrame === f.id}
              gold={state.gold}
              onBuy={() => update((s) => buyFrame(s, f.id))}
              onEquip={() => update((s) => equipFrame(s, f.id))}
              onUnequip={() => update((s) => equipFrame(s, null))}
            />
          ))}
        </div>
      </section>

      <section className="panel p-6">
        <h3 className="text-sm font-semibold">Темы карточки-шаринга</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Меняют цветовую схему карточки персонажа (📤 Поделиться профилем).
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {CARD_THEMES.map((t) => (
            <ThemeRow
              key={t.id}
              item={t}
              owned={ownsCardTheme(state, t.id)}
              equipped={state.equippedCardTheme === t.id}
              gold={state.gold}
              onBuy={() => update((s) => buyCardTheme(s, t.id))}
              onEquip={() => update((s) => equipCardTheme(s, t.id))}
            />
          ))}
        </div>
      </section>

      <section className="panel p-6">
        <h3 className="text-sm font-semibold">Титулы</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Показываются рядом с именем на главном экране.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {TITLES.filter((t) => !t.exclusive).map((t) => (
            <TitleRow
              key={t.id}
              item={t}
              owned={ownsTitle(state, t.id)}
              equipped={state.equippedTitle === t.id}
              gold={state.gold}
              onBuy={() => update((s) => buyTitle(s, t.id))}
              onEquip={() => update((s) => equipTitle(s, t.id))}
              onUnequip={() => update((s) => equipTitle(s, null))}
            />
          ))}
        </div>
      </section>

      <section className="panel p-6">
        <h3 className="text-sm font-semibold">🏆 Эксклюзив за испытания</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Нельзя купить за золото — только заработать, пройдя босс-квест недели хотя бы раз.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {AVATAR_FRAMES.filter((f) => f.exclusive).map((f) => (
            <FrameRow
              key={f.id}
              item={f}
              owned={ownsFrame(state, f.id)}
              equipped={state.equippedFrame === f.id}
              gold={state.gold}
              locked
              onBuy={() => {}}
              onEquip={() => update((s) => equipFrame(s, f.id))}
              onUnequip={() => update((s) => equipFrame(s, null))}
            />
          ))}
          {TITLES.filter((t) => t.exclusive).map((t) => (
            <TitleRow
              key={t.id}
              item={t}
              owned={ownsTitle(state, t.id)}
              equipped={state.equippedTitle === t.id}
              gold={state.gold}
              locked
              onBuy={() => {}}
              onEquip={() => update((s) => equipTitle(s, t.id))}
              onUnequip={() => update((s) => equipTitle(s, null))}
            />
          ))}
        </div>
      </section>

      <section className="panel p-6">
        <h3 className="text-sm font-semibold">Отложить квест на завтра</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Прямо в списке ежедневных квестов, у каждого невыполненного — кнопка «Отложить». Снимает
          его с сегодняшнего списка без штрафа по календарю дисциплины, но и без XP/золота за него —
          квест просто вернётся завтра. Стоит {POSTPONE_PRICE_GOLD}💰, максимум{" "}
          {POSTPONE_DAILY_LIMIT} раза в день.
        </p>
      </section>

      <section className="panel p-6">
        <h3 className="text-sm font-semibold">Дополнительный читмил</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          +1 к месячному лимиту разрешённых поблажек в питании (Питание → БЖУ-калькулятор).
          Использовано в этом месяце: {cheatMealBonusThisMonth(state)} /{" "}
          {CHEAT_MEAL_BONUS_MAX_PER_MONTH}.
        </p>
        <button
          type="button"
          disabled={!canBuyCheatMealBonus(state)}
          onClick={() => update((s) => buyCheatMealBonus(s))}
          className="mt-3 rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-all enabled:hover:-translate-y-0.5 enabled:hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Купить +1 читмил ({CHEAT_MEAL_BONUS_PRICE}💰)
        </button>
      </section>
    </div>
  );
}

function FrameRow({
  item,
  owned,
  equipped,
  gold,
  locked,
  onBuy,
  onEquip,
  onUnequip,
}: {
  item: AvatarFrame;
  owned: boolean;
  equipped: boolean;
  gold: number;
  /** True for exclusive boss-quest-reward items — replaces the buy button
   * with a plain "locked" state instead, since these can't be purchased. */
  locked?: boolean;
  onBuy: () => void;
  onEquip: () => void;
  onUnequip: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 ${equipped ? "border-primary/50 bg-primary/5" : "border-border"}`}
    >
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary"
        style={{
          border: `${item.style.borderWidth}px solid ${item.style.borderColor}`,
          boxShadow: item.style.boxShadow,
        }}
      >
        🙂
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.label}</div>
        <div className="text-[11px]" style={{ color: RARITY_COLOR[item.rarity] }}>
          {locked ? RARITY_LABEL[item.rarity] : `${RARITY_LABEL[item.rarity]} · ${item.price}💰`}
        </div>
      </div>
      <ShopAction
        owned={owned}
        equipped={equipped}
        canAfford={gold >= item.price}
        locked={locked}
        onBuy={onBuy}
        onEquip={onEquip}
        onUnequip={onUnequip}
      />
    </div>
  );
}

function ThemeRow({
  item,
  owned,
  equipped,
  gold,
  onBuy,
  onEquip,
}: {
  item: CardTheme;
  owned: boolean;
  equipped: boolean;
  gold: number;
  onBuy: () => void;
  onEquip: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${equipped ? "border-primary/50 bg-primary/5" : "border-border"}`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{item.label}</div>
        <div className="text-[11px]" style={{ color: RARITY_COLOR[item.rarity] }}>
          {item.price === 0 ? "Бесплатно" : `${RARITY_LABEL[item.rarity]} · ${item.price}💰`}
        </div>
      </div>
      <ShopAction
        owned={owned}
        equipped={equipped}
        canAfford={gold >= item.price}
        onBuy={onBuy}
        onEquip={onEquip}
      />
    </div>
  );
}

function TitleRow({
  item,
  owned,
  equipped,
  gold,
  locked,
  onBuy,
  onEquip,
  onUnequip,
}: {
  item: Title;
  owned: boolean;
  equipped: boolean;
  gold: number;
  locked?: boolean;
  onBuy: () => void;
  onEquip: () => void;
  onUnequip: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${equipped ? "border-primary/50 bg-primary/5" : "border-border"}`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">«{item.label}»</div>
        <div className="text-[11px]" style={{ color: RARITY_COLOR[item.rarity] }}>
          {locked ? RARITY_LABEL[item.rarity] : `${RARITY_LABEL[item.rarity]} · ${item.price}💰`}
        </div>
      </div>
      <ShopAction
        owned={owned}
        equipped={equipped}
        canAfford={gold >= item.price}
        locked={locked}
        onBuy={onBuy}
        onEquip={onEquip}
        onUnequip={onUnequip}
      />
    </div>
  );
}

function ShopAction({
  owned,
  equipped,
  canAfford,
  locked,
  onBuy,
  onEquip,
  onUnequip,
}: {
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  /** Exclusive boss-quest-reward item not yet earned — show a plain locked
   * badge instead of a buy button (see FrameRow/TitleRow). */
  locked?: boolean;
  onBuy: () => void;
  onEquip: () => void;
  onUnequip?: () => void;
}) {
  if (!owned) {
    if (locked) {
      return (
        <span className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
          🔒 Заработай в испытании
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={!canAfford}
        onClick={onBuy}
        className="shrink-0 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-all enabled:hover:-translate-y-0.5 enabled:hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Купить
      </button>
    );
  }
  if (equipped) {
    return onUnequip ? (
      <button
        type="button"
        onClick={onUnequip}
        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:bg-secondary"
      >
        Снять
      </button>
    ) : (
      <span className="shrink-0 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary">
        Надето
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onEquip}
      className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 hover:bg-secondary"
    >
      Надеть
    </button>
  );
}
