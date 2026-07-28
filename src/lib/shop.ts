import { BOSS_EXCLUSIVE_FRAME_ID, BOSS_EXCLUSIVE_TITLE_ID, type GameState } from "@/lib/game";
import { monthKey } from "@/lib/nutrition";

export type Rarity = "common" | "rare" | "epic";

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Обычная",
  rare: "Редкая",
  epic: "Эпическая",
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "var(--color-muted-foreground)",
  rare: "var(--color-primary)",
  epic: "var(--color-accent-2)",
};

export interface AvatarFrame {
  id: string;
  label: string;
  price: number;
  rarity: Rarity;
  // Purely CSS — a ring/border style applied around the avatar circle.
  style: { borderColor: string; borderWidth: number; boxShadow?: string };
  // True only for the weekly-boss-quest reward items — never purchasable
  // with gold, only unlocked via checkBossQuestCompletion() in game.ts. See
  // ShopPanel's separate "Эксклюзив за испытания" section.
  exclusive?: boolean;
}

// Prices rebalanced around GOLD_PER_XP in game.ts (~15 gold for a typical
// fully-completed day): common ≈ 3-5 days, rare ≈ 1-2 weeks, epic ≈ a month.
export const AVATAR_FRAMES: AvatarFrame[] = [
  {
    id: "bronze",
    label: "Бронзовое кольцо",
    price: 50,
    rarity: "common",
    style: { borderColor: "#b8895a", borderWidth: 3 },
  },
  {
    id: "silver",
    label: "Серебряное кольцо",
    price: 70,
    rarity: "common",
    style: { borderColor: "#c3c9d1", borderWidth: 3 },
  },
  {
    id: "gold",
    label: "Золотое кольцо",
    price: 150,
    rarity: "rare",
    style: { borderColor: "#e0b23d", borderWidth: 4, boxShadow: "0 0 0 2px #e0b23d33" },
  },
  {
    id: "emerald",
    label: "Изумрудная рамка",
    price: 200,
    rarity: "rare",
    style: { borderColor: "#3fae6a", borderWidth: 4, boxShadow: "0 0 0 2px #3fae6a33" },
  },
  {
    id: "prismatic",
    label: "Радужная рамка",
    price: 450,
    rarity: "epic",
    // box-shadow can't hold a gradient — layered glow in two accent hues
    // instead, still visibly the "flashiest" of the set.
    style: {
      borderColor: "#a05fff",
      borderWidth: 4,
      boxShadow: "0 0 0 2px #ff5f6d55, 0 0 14px 2px #a05fff66",
    },
  },
  {
    id: BOSS_EXCLUSIVE_FRAME_ID,
    label: "Рамка победителя боссов",
    price: 0,
    rarity: "epic",
    exclusive: true,
    style: {
      borderColor: "#ff3b3b",
      borderWidth: 4,
      boxShadow: "0 0 0 2px #ff3b3b33, 0 0 16px 3px #ff3b3b55",
    },
  },
];

export interface CardTheme {
  id: string;
  label: string;
  price: number;
  rarity: Rarity;
}

/** IDs match ShareCardModal.tsx's THEMES map. "classic" is free/default. */
export const CARD_THEMES: CardTheme[] = [
  { id: "classic", label: "Тёмное золото (стандарт)", price: 0, rarity: "common" },
  { id: "ocean", label: "Океан", price: 120, rarity: "rare" },
  { id: "midnight", label: "Полночь", price: 450, rarity: "epic" },
];

export interface Title {
  id: string;
  label: string;
  price: number;
  rarity: Rarity;
  // See AvatarFrame.exclusive — same rule, same reason.
  exclusive?: boolean;
}

export const TITLES: Title[] = [
  { id: "early_bird", label: "Ранняя пташка", price: 55, rarity: "common" },
  { id: "night_owl", label: "Ночная сова", price: 55, rarity: "common" },
  { id: "quest_machine", label: "Квестовая машина", price: 65, rarity: "common" },
  { id: "snack_slayer", label: "Гроза перекусов", price: 65, rarity: "common" },
  { id: "chaos_gremlin", label: "Гремлин хаоса", price: 120, rarity: "rare" },
  { id: "iron_will", label: "Железная воля", price: 140, rarity: "rare" },
  { id: "calendar_wizard", label: "Волшебник календаря", price: 140, rarity: "rare" },
  { id: "gains_goblin", label: "Гоблин прогресса", price: 160, rarity: "rare" },
  { id: "legend_in_progress", label: "Легенда в процессе", price: 450, rarity: "epic" },
  { id: "unstoppable", label: "Неудержимый", price: 450, rarity: "epic" },
  {
    id: BOSS_EXCLUSIVE_TITLE_ID,
    label: "Победитель боссов",
    price: 0,
    rarity: "epic",
    exclusive: true,
  },
];

export function ownsFrame(state: GameState, id: string): boolean {
  return state.unlockedFrames.includes(id);
}
export function ownsCardTheme(state: GameState, id: string): boolean {
  return id === "classic" || state.unlockedCardThemes.includes(id);
}
export function ownsTitle(state: GameState, id: string): boolean {
  return state.unlockedTitles.includes(id);
}

export function buyFrame(state: GameState, id: string): GameState {
  const item = AVATAR_FRAMES.find((f) => f.id === id);
  // Exclusive items (see AvatarFrame.exclusive) can only ever be unlocked by
  // checkBossQuestCompletion() in game.ts — never through this purchase
  // path, even at price 0, no matter what the UI does.
  if (!item || item.exclusive || ownsFrame(state, id) || state.gold < item.price) return state;
  return {
    ...state,
    gold: state.gold - item.price,
    unlockedFrames: [...state.unlockedFrames, id],
    equippedFrame: id,
  };
}

export function buyCardTheme(state: GameState, id: string): GameState {
  const item = CARD_THEMES.find((t) => t.id === id);
  if (!item || ownsCardTheme(state, id) || state.gold < item.price) return state;
  return {
    ...state,
    gold: state.gold - item.price,
    unlockedCardThemes: [...state.unlockedCardThemes, id],
    equippedCardTheme: id,
  };
}

export function buyTitle(state: GameState, id: string): GameState {
  const item = TITLES.find((t) => t.id === id);
  // See buyFrame's comment — same exclusive-item guard.
  if (!item || item.exclusive || ownsTitle(state, id) || state.gold < item.price) return state;
  return {
    ...state,
    gold: state.gold - item.price,
    unlockedTitles: [...state.unlockedTitles, id],
    equippedTitle: id,
  };
}

export function equipFrame(state: GameState, id: string | null): GameState {
  if (id !== null && !ownsFrame(state, id)) return state;
  return { ...state, equippedFrame: id };
}
export function equipCardTheme(state: GameState, id: string): GameState {
  if (!ownsCardTheme(state, id)) return state;
  return { ...state, equippedCardTheme: id };
}
export function equipTitle(state: GameState, id: string | null): GameState {
  if (id !== null && !ownsTitle(state, id)) return state;
  return { ...state, equippedTitle: id };
}

// ── Extra cheat meal (extends the monthly limit in nutrition.ts) ──

export const CHEAT_MEAL_BONUS_PRICE = 30;
/** Cap on how many extra cheat meals can be bought in a single month — keeps
 * this a small nice-to-have rather than a way to buy your way out of the
 * cheat-meal system entirely. */
export const CHEAT_MEAL_BONUS_MAX_PER_MONTH = 3;

export function cheatMealBonusThisMonth(state: GameState): number {
  return state.cheatMealBonus[monthKey()] ?? 0;
}

export function canBuyCheatMealBonus(state: GameState): boolean {
  return (
    state.gold >= CHEAT_MEAL_BONUS_PRICE &&
    cheatMealBonusThisMonth(state) < CHEAT_MEAL_BONUS_MAX_PER_MONTH
  );
}

export function buyCheatMealBonus(state: GameState): GameState {
  if (!canBuyCheatMealBonus(state)) return state;
  const mk = monthKey();
  return {
    ...state,
    gold: state.gold - CHEAT_MEAL_BONUS_PRICE,
    cheatMealBonus: { ...state.cheatMealBonus, [mk]: cheatMealBonusThisMonth(state) + 1 },
  };
}
