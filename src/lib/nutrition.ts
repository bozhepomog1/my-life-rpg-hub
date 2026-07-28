import {
  computeNutritionGoals,
  todayKey,
  type GameState,
  type Macro,
  type NutritionDay,
} from "@/lib/game";
import { searchOpenFoodFacts, type OffProduct } from "@/lib/openfoodfacts";

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
    keywords: ["овощи гриль", "овощное рагу"],
    kcal: 90,
    protein: 2,
    fat: 5,
    carbs: 10,
  },
  { label: "Капуста", keywords: ["капуст"], kcal: 27, protein: 1.8, fat: 0.1, carbs: 6.6 },
  { label: "Морковь", keywords: ["морков"], kcal: 41, protein: 0.9, fat: 0.2, carbs: 10 },

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
  { label: "Финики", keywords: ["финик"], kcal: 277, protein: 2, fat: 0.4, carbs: 75 },
  { label: "Курага", keywords: ["кураг"], kcal: 241, protein: 3.4, fat: 0.5, carbs: 63 },
  { label: "Изюм", keywords: ["изюм"], kcal: 299, protein: 3, fat: 0.5, carbs: 79 },
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
 *
 * Handles a comma-separated (or otherwise free-form) list of several dishes
 * in one message by design: the outer loop below checks EVERY entry in
 * FOOD_DB against the remaining text, so "борщ, блины, кофе" recognizes and
 * sums all three, not just the first. The inner loop additionally keeps
 * matching the same dish's keyword as many times as it actually appears
 * ("2 яйца, ещё яйцо" → two separate entries), instead of stopping after
 * the first occurrence. Matching itself is root-based, not exact-word: a
 * keyword like "борщ" matches "борща"/"борщом"/etc via plain substring
 * search anchored at a word start (see findWordAligned) — no need for the
 * message to use the dictionary form of a word.
 */
export function parseMeal(rawText: string): ParsedMeal | null {
  let working = ` ${rawText.toLowerCase()} `;
  const items: ParsedMealItem[] = [];

  for (const food of FOOD_DB) {
    for (const kw of food.keywords) {
      let matchedThisKeyword = false;

      // Keep matching this SAME keyword for as long as it keeps appearing,
      // so every mention of a repeated dish gets its own summed entry.
      for (;;) {
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
        if (idx === -1) break;
        matchedThisKeyword = true;

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
      }

      // Only one keyword "wins" per food (the first in its list with any
      // match) — same as before — but now every occurrence of that keyword
      // has already been captured above.
      if (matchedThisKeyword) break;
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

/** A single quantity-extraction pass, reused across whole comma-separated segments (see extractSegmentQuantity below). */
function extractSegmentQuantity(segment: string): number {
  const gramMatch = segment.match(/(\d+)\s*(?:г\.?|гр\.?|грамм[а-я]*)\b/i);
  if (gramMatch) {
    const grams = parseInt(gramMatch[1], 10);
    if (Number.isFinite(grams) && grams > 0) return Math.min(grams / 100, 20);
  }
  const countMatch = segment.match(/(\d+)\s*(?:шт\.?|штук[аи]?)?/);
  if (countMatch) {
    const n = parseInt(countMatch[1], 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 20);
  }
  return 1;
}

export interface OnlineMealItem extends Macro {
  label: string;
  qty: number;
  source: "online" | "local";
}

export type SegmentResolution =
  | { segment: string; kind: "resolved"; item: OnlineMealItem }
  | { segment: string; kind: "choose"; qty: number; candidates: OffProduct[] }
  | { segment: string; kind: "not-found" };

/** Turns one Open Food Facts product + a quantity multiplier into a loggable item. */
function offProductToItem(product: OffProduct, qty: number): OnlineMealItem {
  return {
    label: product.label,
    qty,
    kcal: product.kcal * qty,
    protein: product.protein * qty,
    fat: product.fat * qty,
    carbs: product.carbs * qty,
    source: "online",
  };
}

/**
 * Resolves a free-text meal description against Open Food Facts, one
 * comma-separated dish per segment, WITH a fallback to the local FOOD_DB
 * (see parseMeal above) whenever OFF has no match for a segment — whether
 * because the product genuinely isn't in OFF, or the API/network is
 * unavailable (searchOpenFoodFacts never throws; an unreachable API just
 * looks like "zero results" here, same code path as a real miss).
 *
 * Each segment resolves to one of:
 * - "resolved": exactly one OFF product matched (or none did, and the
 *   local database found something) — used directly, no user input needed.
 * - "choose": OFF returned more than one plausible product — the caller
 *   (NutritionCalculator) shows these as options and the user picks one.
 * - "not-found": neither OFF nor the local database recognized the segment.
 */
export async function resolveMealOnline(rawText: string): Promise<SegmentResolution[]> {
  const segments = rawText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const results: SegmentResolution[] = [];
  for (const segment of segments) {
    const qty = extractSegmentQuantity(segment);
    let candidates: OffProduct[] = [];
    try {
      candidates = await searchOpenFoodFacts(segment);
    } catch {
      // searchOpenFoodFacts already catches internally and resolves to
      // [], but guard here too in case that contract ever changes.
      candidates = [];
    }

    if (candidates.length === 1) {
      results.push({ segment, kind: "resolved", item: offProductToItem(candidates[0], qty) });
      continue;
    }
    if (candidates.length > 1) {
      results.push({ segment, kind: "choose", qty, candidates });
      continue;
    }

    // No OFF match (including "API unreachable") — fall back to the local
    // keyword database for just this segment.
    const local = parseMeal(segment);
    if (local && local.items.length > 0) {
      // A segment is meant to be one dish; if the local matcher still finds
      // several local keywords inside it, combine them into a single
      // fallback entry so this segment always yields exactly one list row.
      const label = local.items.map((i) => i.label).join(" + ");
      results.push({
        segment,
        kind: "resolved",
        item: { label, qty: 1, ...local.totals, source: "local" },
      });
    } else {
      results.push({ segment, kind: "not-found" });
    }
  }
  return results;
}

/** Turns a user's picked OFF candidate for a "choose" segment into a resolved item. */
export function resolveChoice(product: OffProduct, qty: number): OnlineMealItem {
  return offProductToItem(product, qty);
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
