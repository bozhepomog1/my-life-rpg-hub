import {
  computeNutritionGoals,
  todayKey,
  type GameState,
  type Macro,
  type NutritionDay,
} from "@/lib/game";
import { searchOpenFoodFacts, type OffProduct } from "@/lib/openfoodfacts";
import { supabase } from "@/lib/supabase";

export type { Macro, NutritionDay } from "@/lib/game";

/**
 * Fallback daily targets for an average adult, used only until the user has
 * filled in enough of "Параметры тела" (height/weight/age/sex/goal) for the
 * Mifflin-St Jeor calculation in computeNutritionGoals() to kick in — see
 * baseGoals() below.
 */
export const NUTRITION_GOALS: Macro = {
  kcal: 2200,
  protein: 130,
  fat: 70,
  carbs: 260,
};

/**
 * The nutrition goals before today's cheat-meal reduction: a manual
 * override if the user set one, otherwise the calculated goals from body
 * params, otherwise the generic fallback above.
 */
export function baseGoals(state: GameState): Macro {
  return state.body.nutritionOverride ?? computeNutritionGoals(state.body) ?? NUTRITION_GOALS;
}

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

/** Free monthly limit plus any extra cheat meals bought in the Shop this
 * month (see shop.ts buyCheatMealBonus) — kept here rather than duplicated
 * so every caller of cheatMealsRemaining automatically accounts for it. */
export function cheatMealsRemaining(state: GameState): number {
  const bonus = state.cheatMealBonus[monthKey()] ?? 0;
  return Math.max(0, MONTHLY_CHEAT_LIMIT + bonus - cheatMealsUsedThisMonth(state));
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

/** Today's effective macro goals — base goals, lowered carbs/fat if a cheat meal was used today. */
export function effectiveGoals(state: GameState): Macro {
  const goals = baseGoals(state);
  const day = getTodayNutrition(state);
  if (!day.cheatMealUsed) return goals;
  return {
    ...goals,
    carbs: Math.round(goals.carbs * (1 - CHEAT_MEAL_REDUCTION)),
    fat: Math.round(goals.fat * (1 - CHEAT_MEAL_REDUCTION)),
  };
}

interface FoodItem extends Macro {
  label: string;
  keywords: string[];
}

/**
 * Local database of 120+ common foods/dishes with approximate calories and
 * macros — raw ingredients as well as composed/regional dishes (soups,
 * garnishes, fast food, pastries, borsch/holodnik/okroshka/plov and the
 * like), not just "raw" products. Values are rough averages for a simple
 * text-based estimator, not precise nutritional data. Still entirely a
 * local keyword lookup — no external/AI calls.
 *
 * Two conventions are used, matching how people actually describe food:
 * - Starchy staples that are normally cooked from a raw/dry form (rice,
 *   buckwheat, oatmeal, pasta, potato) and meats/fish are given PER 100G OF
 *   THE READY-TO-EAT/COOKED PRODUCT — never raw or dry weight, since dry
 *   grain and cooked grain have very different calorie density (cooking
 *   adds water, not calories).
 * - Discrete items people count rather than weigh (eggs, a banana, a slice
 *   of bread, a cup of coffee, a cookie) are given per natural unit/serving
 *   instead — nobody says "100g of egg", they say "2 eggs".
 *
 * The stepped search UI (searchLocalFoodDb/searchProducts below) doesn't
 * need to know which convention a given entry follows — the user picks the
 * unit (грамм/мл/порция/шт/ст.л./ч.л./стакан) themselves on the quantity
 * step, and suggestedUnitsFor() just makes a best-effort guess at a sensible
 * DEFAULT unit from the label text, always leaving every unit selectable.
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
    label: "Картофель фри",
    keywords: ["фри"],
    kcal: 312,
    protein: 3.4,
    fat: 15,
    carbs: 41,
  },
  {
    label: "Куриная грудка",
    // "курин" catches every adjective form (куриная/куриное/куриные/
    // куриного/куриных/...) that "куриц" alone misses — "куриные бёдра"
    // doesn't contain "куриц" (different stem for the plural adjective),
    // so it used to fall through entirely despite being one of the most
    // common ways people actually phrase chicken.
    keywords: ["куриная грудка", "куриное филе", "курица", "куриц", "курин"],
    kcal: 165,
    protein: 31,
    fat: 3.6,
    carbs: 0,
  },
  // Distinct from breast — noticeably higher fat, common enough as its own
  // dish (тушёные/жареные куриные бёдра) to warrant separate macros rather
  // than folding it into "Куриная грудка".
  {
    label: "Куриное бедро",
    keywords: ["бедр"],
    kcal: 209,
    protein: 24,
    fat: 12,
    carbs: 0,
  },
  {
    label: "Индейка",
    keywords: ["индейк", "индюш"],
    kcal: 149,
    protein: 26,
    fat: 4.5,
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
  // Distinct from "Яичница" (fried) — a different everyday egg dish with
  // its own keyword, previously only findable via "яичниц"/"яйц".
  { label: "Омлет", keywords: ["омлет"], kcal: 154, protein: 11, fat: 11, carbs: 2 },
  // Per 100g cooked/boiled — see file-level note above.
  { label: "Рис варёный", keywords: ["рис"], kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  // "гречнев" catches the adjective form "гречневая каша" — "гречк" alone
  // doesn't (different stem: "гречн-евая" vs "гречк-а"), same class of gap
  // as курин/свин above.
  {
    label: "Гречка",
    keywords: ["гречк", "гречнев"],
    kcal: 92,
    protein: 3.4,
    fat: 1,
    carbs: 20,
  },
  { label: "Перловая каша", keywords: ["перлов"], kcal: 109, protein: 3.1, fat: 0.4, carbs: 22 },
  { label: "Пшённая каша", keywords: ["пшён", "пшен"], kcal: 135, protein: 4, fat: 1.5, carbs: 26 },
  { label: "Манная каша", keywords: ["манн"], kcal: 98, protein: 3, fat: 3.2, carbs: 15 },
  {
    label: "Рисовая каша (молочная)",
    keywords: ["рисовая каш", "рисовой каш"],
    kcal: 97,
    protein: 2.7,
    fat: 2.4,
    carbs: 16,
  },
  // Cooked with water (porridge), not dry oats — dry oats have ~60g
  // carbs/100g, but water roughly triples the weight once cooked.
  { label: "Овсянка", keywords: ["овсян"], kcal: 71, protein: 2.5, fat: 1.5, carbs: 12 },
  // Generic grain porridge, for when someone just says "каша" without
  // specifying which grain — "овсян"/"гречк" above only match if the
  // person names the specific grain.
  {
    label: "Каша (крупяная)",
    keywords: ["каша", "кашу", "каши", "кашей", "кашка"],
    kcal: 90,
    protein: 3,
    fat: 2,
    carbs: 16,
  },
  { label: "Творог", keywords: ["творог"], kcal: 178, protein: 25.5, fat: 7.5, carbs: 4.5 },
  { label: "Банан", keywords: ["банан"], kcal: 105, protein: 1.3, fat: 0.3, carbs: 27 },
  { label: "Хлеб / тост", keywords: ["хлеб", "тост"], kcal: 75, protein: 2.5, fat: 1, carbs: 14 },
  { label: "Кофе", keywords: ["кофе"], kcal: 2, protein: 0.3, fat: 0, carbs: 0 },
  { label: "Чай", keywords: ["чай"], kcal: 2, protein: 0, fat: 0, carbs: 0.5 },
  { label: "Молоко", keywords: ["молок"], kcal: 122, protein: 6.6, fat: 6.4, carbs: 9.6 },
  { label: "Йогурт натуральный", keywords: ["йогурт"], kcal: 90, protein: 5, fat: 3, carbs: 8 },
  { label: "Кефир", keywords: ["кефир"], kcal: 52, protein: 3.4, fat: 2.5, carbs: 4.7 },
  { label: "Ряженка", keywords: ["ряженк"], kcal: 67, protein: 2.9, fat: 4, carbs: 4.2 },
  { label: "Сметана", keywords: ["сметан"], kcal: 206, protein: 2.8, fat: 20, carbs: 3.2 },
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
  // "пюре" itself is listed as its own keyword (not just "картофел"/
  // "картошк") — a bare "пюре" search is one of the most common everyday
  // dishes that used to fall through to Open Food Facts (which barely
  // covers home-cooked dishes) with nothing found locally to fall back on.
  {
    label: "Картофельное пюре",
    // "толчёнка"/"толченка" — common colloquial synonym for mashed potato.
    keywords: ["пюре", "картофел", "картошк", "толчёнк", "толченк"],
    kcal: 87,
    protein: 1.9,
    fat: 0.1,
    carbs: 20,
  },
  {
    label: "Драники",
    keywords: ["драник"],
    kcal: 220,
    protein: 4,
    fat: 12,
    carbs: 24,
  },
  // Distinct from "Картофель фри" (deep-fried) — pan-fried potato slices/
  // wedges, a very common separate home dish with its own denser calorie
  // profile (more oil absorbed, less water than boiled/mashed).
  {
    label: "Жареная картошка",
    keywords: [
      "жареная картошка",
      "жареную картошку",
      "жареной картошки",
      "жареный картофель",
      "жареного картофеля",
      "картошка жареная",
      "картофель жареный",
      "жарёх", // common colloquial synonym
    ],
    kcal: 190,
    protein: 2.7,
    fat: 10,
    carbs: 22,
  },
  // Meat/fish below were already on a per-100g-cooked basis and check out
  // against standard references — left unchanged.
  { label: "Говядина", keywords: ["говядин", "говяж"], kcal: 250, protein: 26, fat: 15, carbs: 0 },
  // "свин" (not just "свинин") also catches the adjective forms "свиной"/
  // "свиная"/"свиные" — same gap as курин/куриц above for chicken.
  { label: "Свинина", keywords: ["свинин", "свин"], kcal: 263, protein: 27, fat: 17, carbs: 0 },
  { label: "Телятина", keywords: ["телятин", "теляч"], kcal: 172, protein: 24, fat: 8, carbs: 0 },
  { label: "Баранина", keywords: ["баранин", "баран"], kcal: 294, protein: 25, fat: 21, carbs: 0 },
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
  { label: "Форель", keywords: ["форел"], kcal: 190, protein: 21, fat: 11, carbs: 0 },
  { label: "Скумбрия", keywords: ["скумбри"], kcal: 190, protein: 18, fat: 13, carbs: 0 },
  {
    label: "Селёдка / сельдь",
    keywords: ["селёдк", "селедк", "сельд"],
    kcal: 218,
    protein: 18,
    fat: 16,
    carbs: 0,
  },
  { label: "Орехи", keywords: ["орех"], kcal: 180, protein: 5, fat: 16, carbs: 5 },
  { label: "Яблоко", keywords: ["яблок"], kcal: 78, protein: 0.4, fat: 0.2, carbs: 20 },
  { label: "Апельсин", keywords: ["апельсин"], kcal: 70, protein: 1.4, fat: 0.2, carbs: 17 },
  { label: "Салат овощной", keywords: ["салат"], kcal: 90, protein: 2, fat: 6, carbs: 8 },
  // Two of the most common everyday Russian-cuisine salads — specific
  // enough names that they don't need "specific before generic" ordering
  // relative to the plain "Салат" entry above (see searchLocalFoodDb: every
  // matching entry is returned as its own candidate, not a first-match-wins
  // lookup, so there's no risk of "Салат овощной" shadowing these).
  { label: "Оливье", keywords: ["оливье"], kcal: 190, protein: 4, fat: 14, carbs: 12 },
  { label: "Винегрет", keywords: ["винегрет"], kcal: 95, protein: 1.5, fat: 6, carbs: 9 },
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

  // --- soups (region/national) ---
  { label: "Щи", keywords: ["щи"], kcal: 90, protein: 4, fat: 4, carbs: 8 },
  { label: "Солянка", keywords: ["солянк"], kcal: 140, protein: 8, fat: 9, carbs: 6 },
  { label: "Харчо", keywords: ["харчо"], kcal: 130, protein: 7, fat: 7, carbs: 10 },
  { label: "Окрошка", keywords: ["окрошк"], kcal: 90, protein: 4, fat: 3, carbs: 10 },
  // "холодник" — холодный свекольный суп (белорусский/литовский), the
  // dish this whole expansion was originally requested for.
  { label: "Холодник", keywords: ["холодник"], kcal: 70, protein: 3, fat: 2, carbs: 10 },
  { label: "Свекольник", keywords: ["свекольник"], kcal: 65, protein: 2, fat: 2, carbs: 10 },
  { label: "Рассольник", keywords: ["рассольник"], kcal: 100, protein: 4, fat: 5, carbs: 10 },
  { label: "Гаспачо", keywords: ["гаспачо"], kcal: 50, protein: 1.5, fat: 2, carbs: 7 },
  { label: "Уха", keywords: ["уха", "ухи"], kcal: 80, protein: 8, fat: 3, carbs: 4 },
  // Clear broth on its own — separate from the generic "Суп" entry, whose
  // "суп" keyword doesn't appear in a bare "бульон" query.
  { label: "Бульон", keywords: ["бульон"], kcal: 20, protein: 2.5, fat: 0.6, carbs: 0.5 },
  {
    label: "Крем-суп / суп-пюре",
    keywords: ["крем-суп", "суп-пюре"],
    kcal: 110,
    protein: 3,
    fat: 6,
    carbs: 10,
  },
  { label: "Минестроне", keywords: ["минестроне"], kcal: 70, protein: 3, fat: 2, carbs: 10 },
  { label: "Том ям", keywords: ["том ям", "том-ям"], kcal: 90, protein: 6, fat: 4, carbs: 8 },
  { label: "Рамен", keywords: ["рамен"], kcal: 436, protein: 18, fat: 15, carbs: 60 },
  { label: "Лагман", keywords: ["лагман"], kcal: 150, protein: 7, fat: 6, carbs: 18 },
  { label: "Шурпа", keywords: ["шурпа"], kcal: 130, protein: 8, fat: 7, carbs: 8 },

  // --- regional/national mains ---
  { label: "Хинкали", keywords: ["хинкал"], kcal: 220, protein: 10, fat: 8, carbs: 27 },
  { label: "Манты", keywords: ["мант"], kcal: 250, protein: 11, fat: 10, carbs: 28 },
  { label: "Чебуреки", keywords: ["чебурек"], kcal: 280, protein: 9, fat: 18, carbs: 22 },
  { label: "Беляши", keywords: ["беляш"], kcal: 260, protein: 9, fat: 15, carbs: 22 },
  { label: "Вареники", keywords: ["вареник"], kcal: 220, protein: 7, fat: 5, carbs: 38 },
  { label: "Голубцы", keywords: ["голубц"], kcal: 150, protein: 8, fat: 7, carbs: 14 },
  { label: "Бешбармак", keywords: ["бешбармак"], kcal: 280, protein: 18, fat: 15, carbs: 20 },
  { label: "Азу", keywords: ["азу"], kcal: 180, protein: 12, fat: 10, carbs: 10 },
  { label: "Гуляш", keywords: ["гуляш"], kcal: 200, protein: 15, fat: 12, carbs: 8 },
  // Generic everyday "meat + vegetables, stewed for a while" home dish —
  // distinct from the specific named stews above (гуляш/азу/бефстроганов),
  // for when someone just says "жаркое" or "тушёное мясо".
  {
    label: "Жаркое / тушёное мясо",
    keywords: ["жаркое", "тушёное мясо", "тушеное мясо"],
    kcal: 180,
    protein: 14,
    fat: 11,
    carbs: 6,
  },
  {
    label: "Бефстроганов",
    keywords: ["бефстроганов", "строганов"],
    kcal: 220,
    protein: 18,
    fat: 14,
    carbs: 5,
  },
  { label: "Котлета", keywords: ["котлет"], kcal: 220, protein: 14, fat: 16, carbs: 8 },
  { label: "Тефтели", keywords: ["тефтел"], kcal: 200, protein: 12, fat: 12, carbs: 10 },
  { label: "Шашлык", keywords: ["шашлык"], kcal: 250, protein: 22, fat: 17, carbs: 0 },
  { label: "Стейк", keywords: ["стейк"], kcal: 271, protein: 25, fat: 19, carbs: 0 },
  { label: "Отбивная", keywords: ["отбивн"], kcal: 260, protein: 20, fat: 18, carbs: 5 },

  // --- fast food ---
  { label: "Куриные крылышки", keywords: ["крыл"], kcal: 290, protein: 18, fat: 24, carbs: 0 },
  {
    label: "Наггетсы",
    keywords: ["наггетс", "нагетс"],
    kcal: 260,
    protein: 14,
    fat: 15,
    carbs: 17,
  },
  { label: "Хот-дог", keywords: ["хот-дог", "хотдог"], kcal: 300, protein: 11, fat: 17, carbs: 26 },
  {
    label: "Чизбургер",
    keywords: ["чизбургер"],
    kcal: 550,
    protein: 28,
    fat: 30,
    carbs: 40,
  },
  {
    label: "Донер-кебаб",
    keywords: ["донер", "дёнер"],
    kcal: 500,
    protein: 22,
    fat: 24,
    carbs: 45,
  },
  { label: "Тако", keywords: ["тако"], kcal: 200, protein: 9, fat: 9, carbs: 22 },
  { label: "Буррито", keywords: ["буррито"], kcal: 350, protein: 15, fat: 12, carbs: 45 },
  { label: "Кесадилья", keywords: ["кесадиль"], kcal: 300, protein: 13, fat: 16, carbs: 28 },
  { label: "Начос", keywords: ["начос"], kcal: 350, protein: 8, fat: 20, carbs: 35 },
  { label: "Фалафель", keywords: ["фалафел"], kcal: 330, protein: 13, fat: 17, carbs: 34 },
  {
    label: "Сэндвич",
    keywords: ["сэндвич", "сендвич"],
    kcal: 300,
    protein: 12,
    fat: 12,
    carbs: 35,
  },
  {
    label: "Лапша быстрого приготовления",
    keywords: ["доширак", "роллтон"],
    kcal: 400,
    protein: 8,
    fat: 16,
    carbs: 55,
  },

  // --- garnishes / legumes ---
  { label: "Кускус", keywords: ["кускус"], kcal: 112, protein: 3.8, fat: 0.2, carbs: 23 },
  { label: "Булгур", keywords: ["булгур"], kcal: 83, protein: 3, fat: 0.2, carbs: 19 },
  { label: "Киноа", keywords: ["киноа", "квиноа"], kcal: 120, protein: 4.4, fat: 1.9, carbs: 21 },
  { label: "Чечевица", keywords: ["чечевиц"], kcal: 116, protein: 9, fat: 0.4, carbs: 20 },
  { label: "Горох", keywords: ["горох"], kcal: 90, protein: 6, fat: 0.4, carbs: 16 },
  { label: "Фасоль", keywords: ["фасол"], kcal: 127, protein: 9, fat: 0.5, carbs: 23 },
  { label: "Хумус", keywords: ["хумус"], kcal: 166, protein: 8, fat: 10, carbs: 14 },
  // Specific vegetable dishes go before the plain "Капуста" entry below, so
  // they claim their words first (same "specific before generic" rule as
  // the top-of-file note).
  {
    label: "Тушёная капуста",
    keywords: ["тушёная капуст", "тушеная капуст"],
    kcal: 80,
    protein: 2,
    fat: 4,
    carbs: 9,
  },
  {
    label: "Цветная капуста",
    keywords: ["цветная капуст", "цветной капуст"],
    kcal: 30,
    protein: 2,
    fat: 0.3,
    carbs: 5,
  },
  { label: "Брокколи", keywords: ["брокколи"], kcal: 34, protein: 2.8, fat: 0.4, carbs: 7 },
  { label: "Спаржа", keywords: ["спарж"], kcal: 20, protein: 2.2, fat: 0.2, carbs: 3.9 },
  {
    label: "Овощи гриль / рагу",
    // Bare "рагу" now matches too (meat ragout included, not just
    // vegetable) — it used to only match the exact phrase "овощное рагу".
    keywords: ["овощи гриль", "овощное рагу", "рагу"],
    kcal: 90,
    protein: 2,
    fat: 5,
    carbs: 10,
  },
  {
    label: "Фаршированный перец",
    keywords: ["фарширован"],
    kcal: 130,
    protein: 6,
    fat: 6,
    carbs: 13,
  },
  { label: "Зразы", keywords: ["зраз"], kcal: 210, protein: 12, fat: 12, carbs: 14 },
  { label: "Долма", keywords: ["долм"], kcal: 170, protein: 8, fat: 10, carbs: 12 },
  { label: "Лазанья", keywords: ["лазань"], kcal: 250, protein: 12, fat: 12, carbs: 22 },
  { label: "Ризотто", keywords: ["ризотто"], kcal: 170, protein: 4, fat: 5, carbs: 27 },
  { label: "Хачапури (кусок)", keywords: ["хачапур"], kcal: 280, protein: 9, fat: 15, carbs: 28 },
  { label: "Капуста", keywords: ["капуст"], kcal: 27, protein: 1.8, fat: 0.1, carbs: 6.6 },
  { label: "Морковь", keywords: ["морков"], kcal: 41, protein: 0.9, fat: 0.2, carbs: 10 },
  { label: "Лук репчатый", keywords: ["лук"], kcal: 40, protein: 1.1, fat: 0.1, carbs: 9 },
  { label: "Чеснок", keywords: ["чеснок", "чесн"], kcal: 149, protein: 6.4, fat: 0.5, carbs: 33 },
  {
    label: "Болгарский перец",
    keywords: ["болгарский перец", "болгарского перца", "сладкий перец"],
    kcal: 27,
    protein: 1,
    fat: 0.3,
    carbs: 6,
  },
  { label: "Свёкла", keywords: ["свёкл", "свекл"], kcal: 43, protein: 1.6, fat: 0.2, carbs: 10 },
  { label: "Шпинат", keywords: ["шпинат"], kcal: 23, protein: 2.9, fat: 0.4, carbs: 3.6 },
  { label: "Тыква", keywords: ["тыкв"], kcal: 26, protein: 1, fat: 0.1, carbs: 6.5 },
  {
    label: "Кабачок / цукини",
    keywords: ["кабачок", "кабачк", "цукини"],
    kcal: 24,
    protein: 1.2,
    fat: 0.3,
    carbs: 4.6,
  },
  { label: "Редис", keywords: ["редис"], kcal: 16, protein: 0.7, fat: 0.1, carbs: 3.4 },

  // --- pastries / desserts ---
  { label: "Круассан", keywords: ["круассан"], kcal: 280, protein: 6, fat: 16, carbs: 30 },
  { label: "Булочка", keywords: ["булочк"], kcal: 250, protein: 6, fat: 8, carbs: 40 },
  { label: "Пирожок", keywords: ["пирожк", "пирожок"], kcal: 220, protein: 5, fat: 10, carbs: 28 },
  { label: "Пирог (кусок)", keywords: ["пирог"], kcal: 300, protein: 5, fat: 13, carbs: 40 },
  { label: "Ватрушка", keywords: ["ватрушк"], kcal: 260, protein: 8, fat: 9, carbs: 38 },
  { label: "Торт (кусок)", keywords: ["торт"], kcal: 380, protein: 5, fat: 20, carbs: 45 },
  { label: "Чизкейк", keywords: ["чизкейк"], kcal: 320, protein: 6, fat: 22, carbs: 26 },
  { label: "Тирамису", keywords: ["тирамису"], kcal: 300, protein: 5, fat: 18, carbs: 28 },
  { label: "Эклер", keywords: ["эклер"], kcal: 250, protein: 4, fat: 14, carbs: 27 },
  { label: "Маффин", keywords: ["маффин"], kcal: 350, protein: 5, fat: 16, carbs: 45 },
  { label: "Вафли", keywords: ["вафл"], kcal: 280, protein: 4, fat: 12, carbs: 40 },
  { label: "Оладьи", keywords: ["оладь"], kcal: 220, protein: 6, fat: 8, carbs: 30 },
  { label: "Сырники", keywords: ["сырник"], kcal: 220, protein: 14, fat: 10, carbs: 18 },
  {
    label: "Творожная запеканка",
    keywords: ["запеканк"],
    kcal: 200,
    protein: 13,
    fat: 8,
    carbs: 18,
  },
  { label: "Панкейки", keywords: ["панкейк"], kcal: 230, protein: 6, fat: 8, carbs: 34 },

  // --- drinks ---
  { label: "Смузи", keywords: ["смузи"], kcal: 150, protein: 3, fat: 1, carbs: 32 },
  { label: "Компот", keywords: ["компот"], kcal: 60, protein: 0.2, fat: 0, carbs: 15 },
  { label: "Кисель", keywords: ["кисель"], kcal: 90, protein: 0.2, fat: 0, carbs: 22 },
  { label: "Морс", keywords: ["морс"], kcal: 50, protein: 0.1, fat: 0, carbs: 12 },
  { label: "Квас", keywords: ["квас"], kcal: 27, protein: 0.2, fat: 0, carbs: 5.2 },
  {
    label: "Лимонад / газировка",
    keywords: ["лимонад", "газировк", "кола"],
    kcal: 42,
    protein: 0,
    fat: 0,
    carbs: 10.6,
  },
  { label: "Сок", keywords: ["сок"], kcal: 45, protein: 0.5, fat: 0.1, carbs: 10 },

  // --- more fruit/snacks ---
  { label: "Виноград", keywords: ["виноград"], kcal: 67, protein: 0.6, fat: 0.2, carbs: 17 },
  { label: "Груша", keywords: ["груш"], kcal: 57, protein: 0.4, fat: 0.1, carbs: 15 },
  { label: "Клубника", keywords: ["клубник"], kcal: 32, protein: 0.7, fat: 0.3, carbs: 7.7 },
  { label: "Мандарин", keywords: ["мандарин"], kcal: 53, protein: 0.8, fat: 0.3, carbs: 13 },
  { label: "Киви", keywords: ["киви"], kcal: 61, protein: 1.1, fat: 0.5, carbs: 15 },
  { label: "Ананас", keywords: ["ананас"], kcal: 50, protein: 0.5, fat: 0.1, carbs: 13 },
  { label: "Персик", keywords: ["персик"], kcal: 39, protein: 0.9, fat: 0.3, carbs: 10 },
  { label: "Слива", keywords: ["слив"], kcal: 46, protein: 0.7, fat: 0.3, carbs: 11 },
  { label: "Арбуз", keywords: ["арбуз"], kcal: 30, protein: 0.6, fat: 0.2, carbs: 8 },
  { label: "Дыня", keywords: ["дын"], kcal: 34, protein: 0.8, fat: 0.2, carbs: 8 },
  { label: "Миндаль", keywords: ["миндал"], kcal: 579, protein: 21, fat: 50, carbs: 22 },
  {
    label: "Грецкий орех",
    keywords: ["грецкий орех", "грецкого ореха"],
    kcal: 654,
    protein: 15,
    fat: 65,
    carbs: 14,
  },
  { label: "Кешью", keywords: ["кешью"], kcal: 553, protein: 18, fat: 44, carbs: 30 },
  {
    label: "Мюсли-батончик",
    keywords: ["мюсли-батончик", "мюслибатончик"],
    kcal: 380,
    protein: 6,
    fat: 12,
    carbs: 62,
  },
  { label: "Финики", keywords: ["финик"], kcal: 277, protein: 2, fat: 0.4, carbs: 75 },
  { label: "Курага", keywords: ["кураг"], kcal: 241, protein: 3.4, fat: 0.5, carbs: 63 },
  { label: "Изюм", keywords: ["изюм"], kcal: 299, protein: 3, fat: 0.5, carbs: 79 },
];

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

/**
 * Step 1 of the stepped nutrition flow: looks up a plain product NAME (no
 * quantity — see the file-level comment on the stepped API below) against
 * the local FOOD_DB. A FOOD_DB entry matches if any of its keywords appears
 * word-aligned inside the query, so "курица" finds "Куриная грудка" and
 * "кофе с молоком" finds the compound "Кофе с молоком" entry specifically
 * (rather than just the generic "Кофе"). Returns every match — like Open
 * Food Facts results, these are shown to the user to choose from, never
 * auto-picked.
 */
function searchLocalFoodDb(query: string): (Macro & { label: string })[] {
  const q = ` ${query.toLowerCase().trim()} `;
  if (!q.trim()) return [];
  const out: (Macro & { label: string })[] = [];
  for (const food of FOOD_DB) {
    const hit = food.keywords.some((kw) => findWordAligned(q, kw) !== -1);
    if (hit) {
      out.push({
        label: food.label,
        kcal: food.kcal,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs,
      });
    }
  }
  return out;
}

/**
 * Classic Levenshtein edit distance, exited early once every cell in a row
 * exceeds `max` — FOOD_DB keywords/query words are always short (a handful
 * of characters), so this cheap O(n*m) version is plenty fast without a
 * fancier algorithm.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prevRow = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prevRow[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prevRow[0];
    prevRow[0] = i;
    let rowMin = prevRow[0];
    for (let j = 1; j <= b.length; j++) {
      const temp = prevRow[j];
      prevRow[j] =
        a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, prevRow[j], prevRow[j - 1]);
      prevDiag = temp;
      rowMin = Math.min(rowMin, prevRow[j]);
    }
    if (rowMin > max) return max + 1;
  }
  return prevRow[b.length];
}

/** How many edits (typo, swapped/missing letter, wrong case ending) still
 * count as "close enough" for a given word length — scaled so a 3-letter
 * word doesn't match almost anything, but a longer word tolerates a couple
 * of mistakes (e.g. a wrong declension ending). */
function fuzzyThreshold(len: number): number {
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

/**
 * Fuzzy fallback for when the exact/substring search above finds nothing
 * locally — compares each word in the query against every single-word
 * FOOD_DB keyword (multi-word phrase keywords like "кофе с молоком" are
 * skipped, since edit-distance between a word and a phrase isn't
 * meaningful) and accepts anything within fuzzyThreshold edits. Catches
 * typos and declension endings the stem keywords don't already cover
 * (e.g. "пюрешки" misspelled as "пюрешеки", or "гречневой" without a
 * matching stem) without ever demoting an exact match — this only runs
 * when searchLocalFoodDb already came back empty, so it can't push a
 * confident hit further down the list.
 */
function searchLocalFoodDbFuzzy(query: string): (Macro & { label: string })[] {
  const words = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return [];

  const out: (Macro & { label: string })[] = [];
  for (const food of FOOD_DB) {
    const hit = food.keywords.some((kw) => {
      if (kw.includes(" ") || kw.length < 3) return false;
      return words.some(
        (w) =>
          editDistance(w, kw, fuzzyThreshold(Math.min(w.length, kw.length))) <=
          fuzzyThreshold(Math.min(w.length, kw.length)),
      );
    });
    if (hit) {
      out.push({
        label: food.label,
        kcal: food.kcal,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs,
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Stepped nutrition-entry flow
//
// Replaces the old "type everything with quantities in one textarea" UX.
// Now: (1) search a product NAME only (searchProducts), (2) the user picks
// one candidate, (3) a separate quantity step asks "how much" as a number +
// unit dropdown and computes the scaled macros live (portionMultiplier),
// (4) "Добавить в приём пищи" appends it to an in-progress draft list
// (MealDraftItem[], held in NutritionCalculator's component state — nothing
// here persists a draft), letting the user repeat for more products before
// (5) "Сохранить в дневник" (addNutritionEntry) commits the whole list as
// one NutritionDay entry.
// ─────────────────────────────────────────────────────────────────────────

/** One product the user can choose from at the search step — either an Open Food Facts product or a local FOOD_DB entry. */
export interface ProductCandidate {
  label: string;
  source: "online" | "local";
  /** OFF barcode, for a stable React key; local matches use their label instead. */
  code?: string;
  // Macros for this product's natural base unit — per 100g/100ml for every
  // Open Food Facts product (OFF's own convention) and for most FOOD_DB
  // staples, but per single item/serving for FOOD_DB's discrete entries
  // (eggs, a banana, a cup of coffee, ...). Deliberately not distinguished
  // here — the quantity step lets the user pick whichever unit actually
  // matches how they're measuring it (see suggestedUnitsFor), rather than
  // this file guessing and locking them into one unit.
  base: Macro;
}

/**
 * Step 1: searches Open Food Facts first, then the local FOOD_DB, and
 * returns every match from both as one combined list for the user to choose
 * from — always a list (even a single hit), never auto-resolved, since the
 * stepped flow's whole point is an explicit pick-then-quantify sequence.
 * Never throws — searchOpenFoodFacts already resolves to [] on any network
 * failure, and this file doesn't add any new failure modes on top.
 */
export async function searchProducts(query: string): Promise<ProductCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let online: OffProduct[] = [];
  try {
    online = await searchOpenFoodFacts(trimmed);
  } catch {
    online = [];
  }

  const onlineCandidates: ProductCandidate[] = online.map((p) => ({
    label: p.label,
    source: "online",
    code: p.code,
    base: { kcal: p.kcal, protein: p.protein, fat: p.fat, carbs: p.carbs },
  }));
  // Fuzzy matching only kicks in once the exact/stem search finds nothing
  // locally — it's a fallback for typos/unhandled declensions, not a
  // replacement for the confident keyword match.
  const exactLocal = searchLocalFoodDb(trimmed);
  const localCandidates: ProductCandidate[] = (
    exactLocal.length > 0 ? exactLocal : searchLocalFoodDbFuzzy(trimmed)
  ).map((f) => ({
    label: f.label,
    source: "local",
    base: { kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs },
  }));

  return [...onlineCandidates, ...localCandidates];
}

/**
 * Heuristic-only check for "this query probably describes two products at
 * once" (e.g. "гречка с колбасой") rather than the single product name the
 * stepped flow expects — a comma, or the conjunction "с" as its own word
 * (checked with surrounding spaces rather than a \b regex, since JS's \b is
 * defined in terms of [A-Za-z0-9_] and doesn't recognize Cyrillic letters
 * as word characters). Used only to show a soft, non-blocking hint under
 * the search field — never prevents searching, and a false positive just
 * means an unnecessary (harmless) suggestion.
 */
export function looksLikeMultipleProducts(query: string): boolean {
  const q = ` ${query.trim().toLowerCase()} `;
  return q.includes(",") || q.includes(" с ");
}

/** Result of a text meal-parse call — mirrors ParseMealPhotoResult below so
 * both entry points can surface a `note` to the user the same way (empty
 * recognition, or the daily rate limit — see parse-meal-text/index.ts). */
export interface ParseMealTextResult {
  items: string[];
  note?: string;
}

/**
 * Free-text meal entry ("гречка с курицей" → ["гречка", "курица"]) — calls
 * the parse-meal-text Supabase Edge Function, which itself calls the Claude
 * API server-side (the API key lives only in Supabase Edge Function
 * Secrets, never in this bundle — see supabase/functions/parse-meal-text/
 * index.ts). This function only extracts item NAMES; the caller then runs
 * each one through the normal searchProducts()/addCandidate flow, one at a
 * time, asking for its weight just like a manually-searched product — the
 * existing local FOOD_DB/Open Food Facts macros stay the actual source of
 * truth, Claude never estimates calories itself.
 *
 * Never throws — any failure (offline, not logged in, malformed response,
 * Edge Function not deployed yet, over the daily rate limit) resolves to an
 * empty item list, matching searchOpenFoodFacts/searchProducts's "fail soft"
 * convention, with `note` carrying a user-facing reason when the Edge
 * Function provided one (rate-limited or "nothing recognized" both do).
 */
export async function parseMealText(text: string): Promise<ParseMealTextResult> {
  const trimmed = text.trim();
  if (!trimmed) return { items: [] };
  try {
    const { data, error } = await supabase.functions.invoke<{
      items?: unknown;
      note?: string;
      error?: string;
    }>("parse-meal-text", { body: { text: trimmed } });
    // Still resolves to [] on any failure (fail-soft — see doc comment
    // above), but logs *why* to the browser console instead of swallowing
    // it silently, so a real problem (function not deployed, missing
    // secret, expired session) is distinguishable from "Claude genuinely
    // found nothing" without needing Supabase dashboard log access.
    if (error) {
      console.warn("parseMealText: Edge Function invoke failed", error);
      return { items: [] };
    }
    if (!data) {
      console.warn("parseMealText: Edge Function returned no data");
      return { items: [] };
    }
    if (data.error) {
      console.warn("parseMealText: Edge Function returned an error", data.error);
      return { items: [] };
    }
    if (!Array.isArray(data.items)) {
      console.warn("parseMealText: unexpected response shape", data);
      return { items: [] };
    }
    const items = data.items.filter(
      (i): i is string => typeof i === "string" && i.trim().length > 0,
    );
    const note = typeof data.note === "string" && data.note.trim() ? data.note.trim() : undefined;
    return { items, note };
  } catch (e) {
    console.warn("parseMealText: unexpected exception", e);
    return { items: [] };
  }
}

/** One food item recognized in a photo, with Claude's own approximate weight
 * estimate — unlike parseMealText's plain name list, the photo-recognition
 * Edge Function (parse-meal-photo) also returns a gram estimate per item
 * since that's the whole point of photo recognition (no scale reference, so
 * the app can't derive weight the way it does for text/manual entry — see
 * NutritionCalculator's queue-with-estimatedGrams handling). */
export interface PhotoFoodItem {
  name: string;
  estimatedGrams: number;
}

export interface ParseMealPhotoResult {
  items: PhotoFoodItem[];
  /** Set when items is empty — a short, honest reason (no food visible, too
   * dark/blurry, etc.) surfaced to the user instead of a generic failure. */
  note?: string;
}

/**
 * Photo meal entry: sends a compressed (see image-compress.ts) photo to the
 * parse-meal-photo Edge Function, which calls Claude's vision API
 * server-side and returns recognized food items with approximate weights.
 * Same fail-soft contract as parseMealText — never throws, any failure
 * resolves to an empty item list with a user-facing `note` explaining what
 * to do next (retry with another photo, or fall back to text/manual entry).
 */
export async function parseMealPhoto(
  base64: string,
  mediaType: string,
): Promise<ParseMealPhotoResult> {
  const FAILURE_NOTE =
    "Не получилось отправить фото на распознавание — попробуй ещё раз, опиши текстом выше или найди продукт вручную ниже.";
  try {
    const { data, error } = await supabase.functions.invoke<{
      items?: unknown;
      note?: string;
      error?: string;
    }>("parse-meal-photo", { body: { image: base64, mediaType } });

    if (error) {
      console.warn("parseMealPhoto: Edge Function invoke failed", error);
      return { items: [], note: FAILURE_NOTE };
    }
    if (!data) {
      console.warn("parseMealPhoto: Edge Function returned no data");
      return { items: [], note: FAILURE_NOTE };
    }
    if (data.error) {
      console.warn("parseMealPhoto: Edge Function returned an error", data.error);
      return { items: [], note: FAILURE_NOTE };
    }

    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items: PhotoFoodItem[] = rawItems
      .map((raw): PhotoFoodItem | null => {
        if (typeof raw !== "object" || raw === null) return null;
        const r = raw as Record<string, unknown>;
        const name = typeof r.name === "string" ? r.name.trim() : "";
        const estimatedGrams =
          typeof r.estimatedGrams === "number" && Number.isFinite(r.estimatedGrams)
            ? Math.max(0, Math.round(r.estimatedGrams))
            : 0;
        if (!name || estimatedGrams <= 0) return null;
        return { name, estimatedGrams };
      })
      .filter((i): i is PhotoFoodItem => i !== null)
      .slice(0, 10);

    if (items.length === 0) {
      // Claude's own `note` explains WHY (no food visible, too dark, etc.) —
      // shown with the same "what to do next" suffix either way, so the
      // message always ends in an actionable fallback rather than just a
      // diagnosis.
      const reason = typeof data.note === "string" && data.note.trim() ? data.note.trim() : null;
      const nextSteps = "Попробуй другое фото, опиши текстом выше или найди продукт вручную ниже.";
      return {
        items: [],
        note: reason
          ? `${reason}. ${nextSteps}`
          : `Не получилось распознать еду на фото. ${nextSteps}`,
      };
    }
    return { items };
  } catch (e) {
    console.warn("parseMealPhoto: unexpected exception", e);
    return { items: [], note: FAILURE_NOTE };
  }
}

/** Units offered on the quantity step, in the app's canonical display order. */
export const PORTION_UNITS = [
  "g",
  "ml",
  "portion",
  "pcs",
  "tbsp",
  "tsp",
  "cup",
  "plate",
  "slice",
] as const;
export type PortionUnit = (typeof PORTION_UNITS)[number];

export const PORTION_UNIT_LABELS: Record<PortionUnit, string> = {
  g: "грамм",
  ml: "мл",
  portion: "порция",
  pcs: "шт",
  tbsp: "ст.л.",
  tsp: "ч.л.",
  cup: "стакан",
  plate: "тарелка",
  slice: "кусок",
};

/**
 * Grams-equivalent for one unit of a WEIGHT/VOLUME-style unit — matches
 * this app's long-standing convention (see game.ts's quest-quantity units):
 * multiplying the entered amount by this and dividing by 100 gives the
 * "per-100g" multiplier. "порция"/"шт" aren't weight-based — those use the
 * entered amount directly as the multiplier (1 порция = ×1, 2 шт = ×2),
 * matching FOOD_DB's per-natural-unit entries (eggs, a banana, ...).
 * "тарелка"/"кусок" ARE weight-based (a typical bowl of soup, a typical
 * bread slice) — added so common ways of measuring a per-100g dish/staple
 * ("1 тарелка супа", "1 кусок хлеба") don't require typing out the grams
 * by hand every time.
 */
const PORTION_UNIT_GRAMS: Partial<Record<PortionUnit, number>> = {
  g: 1,
  ml: 1,
  tbsp: 15,
  tsp: 5,
  cup: 200,
  plate: 300,
  slice: 30,
};

/** Converts an entered amount + unit into the multiplier applied to a product's base macros. */
export function portionMultiplier(amount: number, unit: PortionUnit): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const grams = PORTION_UNIT_GRAMS[unit];
  if (grams == null) return Math.min(amount, 20); // "portion"/"pcs": direct multiplier
  return Math.min((amount * grams) / 100, 20);
}

/**
 * A reasonable DEFAULT unit for a product, guessed from its label text —
 * purely a starting point on the quantity step, every unit stays selectable
 * regardless. Eggs default to "шт" (nobody weighs an egg), drinks default
 * to "мл", bread defaults to "кусок", soups default to "тарелка", everything
 * else defaults to "г".
 *
 * Entries whose macros are already calibrated PER SERVING rather than per
 * 100g — labeled "(кусок)"/"(N яйца)" in FOOD_DB, e.g. a pizza/cake slice or
 * "Яичница (2 яйца)" — default to "шт" too (a direct ×1 multiplier), never "г":
 * defaulting those to grams would silently present a whole-serving number
 * as if it were a 100g measurement, which happens to look plausible but
 * isn't actually one.
 */
export function suggestedUnitFor(label: string): PortionUnit {
  const l = label.toLowerCase();
  if (/\(кусок\)|\(\d+ яйц|яичниц/.test(l)) return "pcs";
  if (/яйц|яиц/.test(l)) return "pcs";
  if (/молок|кофе|латте|капучино|чай|сок|квас|морс|компот|кисель|лимонад|газировк|смузи/.test(l)) {
    return "ml";
  }
  if (/хлеб|тост/.test(l)) return "slice";
  if (
    /суп|борщ|щи|солянк|харчо|окрошк|холодник|свекольник|рассольник|гаспачо|уха|рамен|минестроне|шурпа|лагман/.test(
      l,
    )
  ) {
    return "plate";
  }
  return "g";
}

/** Sensible default amount for a given unit — 100 for weight/volume units, 1 for everything counted (including тарелка/кусок, which already fold their typical weight into PORTION_UNIT_GRAMS). */
export function defaultAmountFor(unit: PortionUnit): number {
  return unit === "g" || unit === "ml" ? 100 : 1;
}

/**
 * Converts a photo-recognition weight estimate (always in grams — see
 * PhotoFoodItem in parseMealPhoto) into a starting amount for whatever unit
 * suggestedUnitFor() picked for the matched candidate, so the quantity step
 * opens prefilled with the AI's own guess instead of the generic
 * defaultAmountFor() default. Only meaningful for units with a known
 * grams-per-unit (g, ml, tbsp, tsp, cup, plate, slice — see
 * PORTION_UNIT_GRAMS above): a 300g photo estimate becomes "1 тарелка"
 * for a soup, "10 кусков" for bread, "300" for a plain "г" default, etc.
 * "pcs"/"portion" units have no fixed weight (nobody can safely convert
 * "150g" into "how many eggs" without knowing the size of one egg here) —
 * for those this just falls back to defaultAmountFor(), same as if no
 * photo estimate existed, rather than guessing a count.
 */
export function amountForEstimatedGrams(unit: PortionUnit, estimatedGrams: number): number {
  const gramsPerUnit = PORTION_UNIT_GRAMS[unit];
  if (gramsPerUnit == null || !Number.isFinite(estimatedGrams) || estimatedGrams <= 0) {
    return defaultAmountFor(unit);
  }
  return Math.max(1, Math.round(estimatedGrams / gramsPerUnit));
}

/** A product added to the in-progress meal draft (see NutritionCalculator), not yet saved to the diary. */
export interface MealDraftItem {
  label: string;
  source: "online" | "local";
  base: Macro;
  amount: number;
  unit: PortionUnit;
}

/** Scales a draft item's base macros by its current amount/unit — recomputed live as the user edits either. */
export function scaledMacro(item: Pick<MealDraftItem, "base" | "amount" | "unit">): Macro {
  const qty = portionMultiplier(item.amount, item.unit);
  return {
    kcal: item.base.kcal * qty,
    protein: item.base.protein * qty,
    fat: item.base.fat * qty,
    carbs: item.base.carbs * qty,
  };
}

export function sumMacros(items: Macro[]): Macro {
  return items.reduce<Macro>(
    (acc, it) => ({
      kcal: acc.kcal + it.kcal,
      protein: acc.protein + it.protein,
      fat: acc.fat + it.fat,
      carbs: acc.carbs + it.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
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

/**
 * Real (not invented) streak of consecutive days logged within the calorie
 * goal, counting backwards from today — same walk-backward pattern as
 * computeStreak() in game.ts. Goals aren't stored historically (only
 * derived from the user's CURRENT body params), so this compares every past
 * day's logged kcal against today's goal rather than trying to reconstruct
 * what the goal was on that day — a reasonable approximation since goals
 * rarely change day to day. A day only counts if something was actually
 * logged (an untouched day trivially "under goal" at 0 kcal shouldn't count
 * as a real streak day).
 */
export function computeNutritionStreak(state: GameState): number {
  const goalKcal = effectiveGoals(state).kcal;
  const isWithinGoal = (dateKey: string) => {
    const day = state.nutrition[dateKey];
    return !!day && day.entries.length > 0 && day.kcal <= goalKcal;
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let current = 0;
  let startOffset = 1;
  if (isWithinGoal(todayKey(today))) {
    current = 1;
    startOffset = 1;
  }
  for (let i = startOffset; i <= 3660; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (isWithinGoal(todayKey(d))) current += 1;
    else break;
  }
  return current;
}

/**
 * Step 5: saves the whole in-progress draft list as ONE meal entry — total
 * macros summed across every item, plus the individual items themselves
 * (frozen at their scaled values as of save time, not a live formula) so a
 * future "Записи сегодня" view could list them out if needed.
 */
export function addNutritionEntry(state: GameState, items: MealDraftItem[]): GameState {
  const key = todayKey();
  const day = state.nutrition[key] ?? { kcal: 0, protein: 0, fat: 0, carbs: 0, entries: [] };
  const scaledItems = items.map((it) => ({ label: it.label, ...scaledMacro(it) }));
  const totals = sumMacros(scaledItems);
  const text = scaledItems.map((it) => it.label).join(" + ");
  const nextDay: NutritionDay = {
    kcal: day.kcal + totals.kcal,
    protein: day.protein + totals.protein,
    fat: day.fat + totals.fat,
    carbs: day.carbs + totals.carbs,
    entries: [...day.entries, { text, ...totals, at: Date.now(), items: scaledItems }],
  };
  return { ...state, nutrition: { ...state.nutrition, [key]: nextDay } };
}
