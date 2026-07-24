import { todayKey, type GameState, type Macro, type NutritionDay } from "@/lib/game";

export type { Macro, NutritionDay } from "@/lib/game";

/** Reasonable default daily targets for an average adult; not user-configurable yet. */
export const NUTRITION_GOALS: Macro = {
  kcal: 2200,
  protein: 130,
  fat: 70,
  carbs: 260,
};

/**
 * Cheat-meal reward system: instead of penalizing an off-plan meal, the user
 * gets a limited number of conscious "rewards" per month. Using one lowers
 * the remaining carb/fat goals for the rest of the day (not protein/kcal —
 * those stay as a sanity check), but the discipline calendar day still
 * counts as green since it only ever looks at daily-quest completion, never
 * nutrition — see computeDiscipline() in game.ts.
 */
export const MONTHLY_CHEAT_LIMIT = 3;
export const CHEAT_MEAL_REDUCTION = 0.25; // 25% off carbs/fat goals for the day

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function cheatMealsUsedThisMonth(state: GameState): number {
  return state.cheatMealsUsed[monthKey()] ?? 0;
}

export function cheatMealsRemaining(state: GameState): number {
  return Math.max(0, MONTHLY_CHEAT_LIMIT - cheatMealsUsedThisMonth(state));
}

/**
 * Consumes one of this month's cheat-meal rewards (no-op if none remain) and
 * flags today so the reduced goals apply. Counter resets automatically at
 * the start of each month since it's keyed by "YYYY-MM" — no cron/migration
 * needed.
 */
export function consumeCheatMeal(state: GameState): GameState {
  if (cheatMealsRemaining(state) <= 0) return state;
  const mk = monthKey();
  const key = todayKey();
  const day: NutritionDay = state.nutrition[key] ?? {
    kcal: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    entries: [],
  };
  return {
    ...state,
    cheatMealsUsed: { ...state.cheatMealsUsed, [mk]: (state.cheatMealsUsed[mk] ?? 0) + 1 },
    nutrition: { ...state.nutrition, [key]: { ...day, cheatMealUsed: true } },
  };
}

/** Today's effective macro goals — lowered carbs/fat if a cheat meal was used today. */
export function effectiveGoals(state: GameState): Macro {
  const day = getTodayNutrition(state);
  if (!day.cheatMealUsed) return NUTRITION_GOALS;
  return {
    ...NUTRITION_GOALS,
    carbs: Math.round(NUTRITION_GOALS.carbs * (1 - CHEAT_MEAL_REDUCTION)),
    fat: Math.round(NUTRITION_GOALS.fat * (1 - CHEAT_MEAL_REDUCTION)),
  };
}

interface FoodItem extends Macro {
  label: string;
  keywords: string[];
}

/**
 * Local database of ~50 common foods/dishes with approximate calories and
 * macros. Values are rough averages for a simple text-based estimator, not
 * precise nutritional data.
 *
 * Two conventions are used, matching how people actually describe food:
 * - Starchy staples that are normally cooked from a raw/dry form (rice,
 *   buckwheat, oatmeal, pasta, potato) and meats/fish are given PER 100G OF
 *   THE READY-TO-EAT/COOKED PRODUCT — never raw or dry weight, since dry
 *   grain and cooked grain have very different calorie density (cooking
 *   adds water, not calories). "рис"/"гречка" with no quantity assumes
 *   100g cooked; write "200г риса" for a bigger portion.
 * - Discrete items people count rather than weigh (eggs, a banana, a slice
 *   of bread, a cup of coffee, a cookie) are given per natural unit/serving
 *   instead — nobody says "100g of egg", they say "2 eggs".
 *
 * Order matters: more specific/compound phrases are listed before the
 * generic single-word items they overlap with (e.g. "кофе с молоком"
 * before the bare "кофе"), because the parser blanks out matched text as
 * it goes so a generic entry won't double-count a phrase already claimed
 * by a more specific one.
 */
const FOOD_DB: FoodItem[] = [
  // --- specific / compound phrases first ---
  { label: "Яичница (2 яйца)", keywords: ["яичниц"], kcal: 200, protein: 13, fat: 16, carbs: 1 },
  {
    label: "Кофе с молоком",
    keywords: ["кофе с молоком", "латте", "капучино"],
    kcal: 60,
    protein: 3,
    fat: 3,
    carbs: 5,
  },
  {
    label: "Чёрный кофе",
    keywords: ["черный кофе", "чёрный кофе", "эспрессо", "американо"],
    kcal: 2,
    protein: 0.3,
    fat: 0,
    carbs: 0,
  },
  {
    // "фри" alone is enough — it's an unambiguous marker in Russian food
    // text; the parseMeal special-case below also blanks a preceding
    // "картофель"/"картошка" so the generic potato entry doesn't also
    // double-count the same words. Per 100g fried, ready to eat.
    label: "Картофель фри",
    keywords: ["фри"],
    kcal: 312,
    protein: 3.4,
    fat: 15,
    carbs: 41,
  },
  {
    label: "Куриная грудка",
    keywords: ["куриная грудка", "куриное филе", "курица", "куриц"],
    kcal: 165,
    protein: 31,
    fat: 3.6,
    carbs: 0,
  },
  {
    label: "Протеиновый коктейль",
    keywords: ["протеин"],
    kcal: 200,
    protein: 20,
    fat: 5,
    carbs: 15,
  },
  {
    label: "Гранола / мюсли",
    keywords: ["гранола", "мюсли"],
    kcal: 200,
    protein: 5,
    fat: 6,
    carbs: 33,
  },

  // --- generic single items ---
  { label: "Яйцо варёное", keywords: ["яйц", "яиц"], kcal: 78, protein: 6.3, fat: 5.3, carbs: 0.6 },
  // Per 100g cooked/boiled — see file-level note above.
  { label: "Рис варёный", keywords: ["рис"], kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  { label: "Гречка", keywords: ["гречк"], kcal: 92, protein: 3.4, fat: 1, carbs: 20 },
  // Cooked with water (porridge), not dry oats — dry oats have ~60g
  // carbs/100g, but water roughly triples the weight once cooked.
  { label: "Овсянка", keywords: ["овсян"], kcal: 71, protein: 2.5, fat: 1.5, carbs: 12 },
  { label: "Творог", keywords: ["творог"], kcal: 178, protein: 25.5, fat: 7.5, carbs: 4.5 },
  { label: "Банан", keywords: ["банан"], kcal: 105, protein: 1.3, fat: 0.3, carbs: 27 },
  { label: "Хлеб / тост", keywords: ["хлеб", "тост"], kcal: 75, protein: 2.5, fat: 1, carbs: 14 },
  { label: "Кофе", keywords: ["кофе"], kcal: 2, protein: 0.3, fat: 0, carbs: 0 },
  { label: "Чай", keywords: ["чай"], kcal: 2, protein: 0, fat: 0, carbs: 0.5 },
  { label: "Молоко", keywords: ["молок"], kcal: 122, protein: 6.6, fat: 6.4, carbs: 9.6 },
  { label: "Йогурт натуральный", keywords: ["йогурт"], kcal: 90, protein: 5, fat: 3, carbs: 8 },
  { label: "Сыр", keywords: ["сыр"], kcal: 110, protein: 7, fat: 9, carbs: 0.5 },
  {
    label: "Сливочное масло",
    keywords: ["сливочное масло", "сливочного масла"],
    kcal: 72,
    protein: 0.1,
    fat: 8,
    carbs: 0,
  },
  {
    label: "Оливковое масло",
    keywords: ["оливковое масло", "оливкового масла"],
    kcal: 119,
    protein: 0,
    fat: 13.5,
    carbs: 0,
  },
  // Per 100g cooked, not dry pasta weight.
  {
    label: "Макароны / паста",
    keywords: ["макарон", "спагетти", "паста"],
    kcal: 131,
    protein: 5,
    fat: 1.1,
    carbs: 25,
  },
  // Per 100g boiled; "пюре" with milk/butter runs a bit higher in practice.
  {
    label: "Картофель варёный / пюре",
    keywords: ["картофел", "картошк"],
    kcal: 87,
    protein: 1.9,
    fat: 0.1,
    carbs: 20,
  },
  // Meat/fish below were already on a per-100g-cooked basis and check out
  // against standard references — left unchanged.
  { label: "Говядина", keywords: ["говядин", "говяж"], kcal: 250, protein: 26, fat: 15, carbs: 0 },
  { label: "Свинина", keywords: ["свинин"], kcal: 263, protein: 27, fat: 17, carbs: 0 },
  {
    label: "Лосось / сёмга",
    keywords: ["лосос", "сёмг", "семг"],
    kcal: 208,
    protein: 20,
    fat: 13,
    carbs: 0,
  },
  {
    label: "Треска / минтай",
    keywords: ["треск", "минтай"],
    kcal: 90,
    protein: 20,
    fat: 1,
    carbs: 0,
  },
  { label: "Тунец", keywords: ["тунец", "тунц"], kcal: 116, protein: 25, fat: 1, carbs: 0 },
  { label: "Орехи", keywords: ["орех"], kcal: 180, protein: 5, fat: 16, carbs: 5 },
  { label: "Яблоко", keywords: ["яблок"], kcal: 78, protein: 0.4, fat: 0.2, carbs: 20 },
  { label: "Апельсин", keywords: ["апельсин"], kcal: 70, protein: 1.4, fat: 0.2, carbs: 17 },
  { label: "Салат овощной", keywords: ["салат"], kcal: 90, protein: 2, fat: 6, carbs: 8 },
  { label: "Пицца (кусок)", keywords: ["пицц"], kcal: 285, protein: 12, fat: 10, carbs: 36 },
  {
    label: "Бургер",
    keywords: ["бургер", "гамбургер"],
    kcal: 500,
    protein: 25,
    fat: 25,
    carbs: 40,
  },
  { label: "Шоколад", keywords: ["шоколад"], kcal: 135, protein: 1.5, fat: 8, carbs: 15 },
  { label: "Печенье", keywords: ["печен"], kcal: 140, protein: 2, fat: 6, carbs: 20 },
  {
    label: "Мороженое",
    keywords: ["мороженое", "морожен"],
    kcal: 207,
    protein: 3.5,
    fat: 11,
    carbs: 24,
  },
  { label: "Суп", keywords: ["суп"], kcal: 120, protein: 6, fat: 4, carbs: 15 },
  { label: "Борщ", keywords: ["борщ"], kcal: 150, protein: 5, fat: 6, carbs: 18 },
  { label: "Плов", keywords: ["плов"], kcal: 400, protein: 12, fat: 15, carbs: 55 },
  { label: "Суши / роллы", keywords: ["суши", "ролл"], kcal: 250, protein: 8, fat: 5, carbs: 45 },
  { label: "Шаурма", keywords: ["шаурм", "шаверм"], kcal: 550, protein: 20, fat: 25, carbs: 60 },
  { label: "Пельмени", keywords: ["пельмен"], kcal: 300, protein: 13, fat: 12, carbs: 35 },
  { label: "Блины", keywords: ["блин"], kcal: 250, protein: 6, fat: 10, carbs: 34 },
  { label: "Мёд", keywords: ["мёд", "мед"], kcal: 60, protein: 0, fat: 0, carbs: 17 },
  { label: "Сахар", keywords: ["сахар"], kcal: 20, protein: 0, fat: 0, carbs: 5 },
  { label: "Авокадо", keywords: ["авокадо"], kcal: 112, protein: 1.3, fat: 10, carbs: 6 },
  {
    label: "Помидор / томат",
    keywords: ["помидор", "томат"],
    kcal: 22,
    protein: 1,
    fat: 0.2,
    carbs: 4.8,
  },
  { label: "Огурец", keywords: ["огурец", "огурц"], kcal: 15, protein: 0.8, fat: 0.1, carbs: 3.6 },
];

/**
 * Looks for a quantity right before a matched keyword; defaults to 1.
 * Supports two forms:
 * - grams ("200г", "150 г", "300 грамм") — for per-100g entries this is a
 *   fractional multiplier of 100g units (200г → 2, 150г → 1.5);
 * - a plain count ("2", "3 шт", "4 штуки") — a whole-item multiplier for
 *   per-unit entries (eggs, bananas, ...).
 */
function quantityBefore(text: string, idx: number): number {
  const before = text.slice(0, idx);

  const gramMatch = before.match(/(\d+)\s*(?:г\.?|гр\.?|грамм[а-я]*)\s*$/);
  if (gramMatch) {
    const grams = parseInt(gramMatch[1], 10);
    if (Number.isFinite(grams) && grams > 0) return Math.min(grams / 100, 20);
  }

  const countMatch = before.match(/(\d+)\s*(?:шт\.?|штук[аи]?)?\s*$/);
  if (!countMatch) return 1;
  const n = parseInt(countMatch[1], 10);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(n, 20);
}

function isLetter(ch: string | undefined): boolean {
  return !!ch && /[a-zа-яё]/i.test(ch);
}

/** Finds a keyword only where it starts a word, so it won't match mid-word (e.g. "чай" inside "случайный"). */
function findWordAligned(haystack: string, needle: string, from = 0): number {
  let at = from;
  for (;;) {
    const idx = haystack.indexOf(needle, at);
    if (idx === -1) return -1;
    if (!isLetter(haystack[idx - 1])) return idx;
    at = idx + 1;
  }
}

/** True if the match is directly preceded by "без"/"не" (e.g. "кофе без сахара"). */
function precededByNegation(text: string, idx: number): boolean {
  const before = text.slice(0, idx).trimEnd();
  const lastWord = before.split(/\s+/).pop() ?? "";
  return lastWord === "без" || lastWord === "не";
}

export interface ParsedMealItem extends Macro {
  label: string;
  qty: number;
}

export interface ParsedMeal {
  items: ParsedMealItem[];
  totals: Macro;
}

/**
 * Simple keyword lookup against the local FOOD_DB — no external calls, no
 * "AI analysis". Matches are consumed (blanked out) as they're found so a
 * generic keyword can't double-count text already claimed by a more
 * specific phrase.
 */
export function parseMeal(rawText: string): ParsedMeal | null {
  let working = ` ${rawText.toLowerCase()} `;
  const items: ParsedMealItem[] = [];

  for (const food of FOOD_DB) {
    for (const kw of food.keywords) {
      let from = 0;
      let idx = -1;
      // Skip past negated occurrences ("без сахара") to look for a real one.
      for (;;) {
        const found = findWordAligned(working, kw, from);
        if (found === -1) break;
        if (precededByNegation(working, found)) {
          working =
            working.slice(0, found) + " ".repeat(kw.length) + working.slice(found + kw.length);
          from = found;
          continue;
        }
        idx = found;
        break;
      }
      if (idx === -1) continue;

      // "картофель/картошка фри": avoid the generic potato entry also
      // double-counting the same words once "фри" claims them here.
      if (kw === "фри") {
        const potatoBefore = working.slice(0, idx).match(/(картофел[а-яё]*|картошк[а-яё]*)\s+$/);
        if (potatoBefore) {
          const start = idx - potatoBefore[0].length;
          working =
            working.slice(0, start) + " ".repeat(potatoBefore[0].length) + working.slice(start);
        }
      }

      const qty = quantityBefore(working, idx);
      items.push({
        label: food.label,
        qty,
        kcal: food.kcal * qty,
        protein: food.protein * qty,
        fat: food.fat * qty,
        carbs: food.carbs * qty,
      });
      working = working.slice(0, idx) + " ".repeat(kw.length) + working.slice(idx + kw.length);
      break;
    }
  }

  if (items.length === 0) return null;

  const totals = items.reduce<Macro>(
    (acc, it) => ({
      kcal: acc.kcal + it.kcal,
      protein: acc.protein + it.protein,
      fat: acc.fat + it.fat,
      carbs: acc.carbs + it.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );

  return { items, totals };
}

export function getTodayNutrition(state: GameState): NutritionDay {
  return (
    state.nutrition[todayKey()] ?? {
      kcal: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      entries: [],
    }
  );
}

/** Adds a parsed meal's totals to today's log, returning a new GameState. */
export function addNutritionEntry(state: GameState, rawText: string, totals: Macro): GameState {
  const key = todayKey();
  const day = state.nutrition[key] ?? { kcal: 0, protein: 0, fat: 0, carbs: 0, entries: [] };
  const nextDay: NutritionDay = {
    kcal: day.kcal + totals.kcal,
    protein: day.protein + totals.protein,
    fat: day.fat + totals.fat,
    carbs: day.carbs + totals.carbs,
    entries: [...day.entries, { text: rawText, ...totals, at: Date.now() }],
  };
  return { ...state, nutrition: { ...state.nutrition, [key]: nextDay } };
}
