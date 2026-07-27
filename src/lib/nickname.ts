/**
 * Auto-generated display nickname for brand-new accounts. Uses Russian
 * neuter-gender adjective/noun pairs ("Тихое Облако", "Смелое Сердце") —
 * neuter grammatical gender isn't tied to a person's actual gender, so the
 * result reads as friendly and gender-neutral rather than defaulting to a
 * masculine or feminine form. Purely a starting point: it's stored in the
 * same free-text `name`/`username` field the user could always rename from
 * Settings, not a separate immutable identifier (that's the short code —
 * see profiles.short_code).
 */

const ADJECTIVES = [
  "Тихое",
  "Яркое",
  "Быстрое",
  "Смелое",
  "Доброе",
  "Весёлое",
  "Спокойное",
  "Дружелюбное",
  "Загадочное",
  "Отважное",
  "Мудрое",
  "Игривое",
  "Стойкое",
  "Солнечное",
  "Звёздное",
  "Морозное",
  "Тёплое",
  "Свежее",
  "Живое",
  "Крылатое",
];

const NOUNS = [
  "Облако",
  "Пламя",
  "Созвездие",
  "Сердце",
  "Приключение",
  "Утро",
  "Море",
  "Эхо",
  "Перо",
  "Зерно",
  "Кольцо",
  "Существо",
  "Чудо",
  "Царство",
  "Странствие",
  "Сияние",
  "Волшебство",
  "Путешествие",
  "Знамя",
  "Семя",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateNickname(): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}
