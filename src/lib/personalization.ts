import {
  accentForMode,
  adjustLightness,
  colorDistance,
  contrastRatio,
  mixHex,
  MIN_SAFE_CONTRAST,
  pickForeground,
  withLightness,
} from "@/lib/color";

export interface AccentColors {
  /** Canonical (user-picked) hex — not theme-adjusted. Used as the source of truth for both themes. */
  primary: string;
  secondary: string;
}

export interface AccentPreset {
  id: string;
  label: string;
  colors: AccentColors;
}

// Five ready-made pairs, terracotta first (today's default, unchanged for
// anyone who never opens this screen). The rest are hand-picked hue pairs
// that stay legible once run through accentForMode() in both themes.
export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: "terracotta",
    label: "Терракота",
    colors: { primary: "#af5f3c", secondary: "#7a9471" },
  },
  {
    id: "ocean",
    label: "Океан",
    colors: { primary: "#3b7ea1", secondary: "#c98a3b" },
  },
  {
    id: "forest",
    label: "Лес",
    colors: { primary: "#4f7d4a", secondary: "#a1673f" },
  },
  {
    id: "berry",
    label: "Ягода",
    colors: { primary: "#9c4a6b", secondary: "#4a8f8c" },
  },
  {
    id: "slate",
    label: "Графит",
    colors: { primary: "#55606e", secondary: "#c08a3e" },
  },
];

export const DEFAULT_ACCENT_COLORS: AccentColors = ACCENT_PRESETS[0].colors;

function sameHex(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function findMatchingPreset(colors: AccentColors): AccentPreset | undefined {
  return ACCENT_PRESETS.find(
    (p) =>
      sameHex(p.colors.primary, colors.primary) && sameHex(p.colors.secondary, colors.secondary),
  );
}

/**
 * The full set of CSS custom-property overrides for one theme, derived from
 * a user's chosen (primary, secondary) accent pair. Also derives:
 * - foreground colors (readable text/icon color on top of the accent), and
 * - hover shades (lighter in dark mode, darker in light mode)
 * via HSL lightness math, so nobody has to hand-pick 6+ shades themselves.
 *
 * The default terracotta primary keeps the exact hex values already baked
 * into styles.css (rather than the HSL round-trip) so users who never touch
 * this feature see a byte-identical result to before.
 */
export function computeAccentCssVars(
  colors: AccentColors,
  mode: "light" | "dark",
): Record<string, string> {
  const dark = mode === "dark";
  const hoverDelta = dark ? 8 : -8;
  const isDefaultPrimary = sameHex(colors.primary, DEFAULT_ACCENT_COLORS.primary);

  const primary = isDefaultPrimary
    ? dark
      ? "#da9472"
      : "#af5f3c"
    : accentForMode(colors.primary, mode);
  const primaryForeground = isDefaultPrimary
    ? dark
      ? "#201510"
      : "#fefdfb"
    : pickForeground(primary);

  const secondary = accentForMode(colors.secondary, mode);
  const secondaryForeground = pickForeground(secondary);

  return {
    "--primary": primary,
    "--accent": primary,
    "--ring": primary,
    "--primary-foreground": primaryForeground,
    "--accent-foreground": primaryForeground,
    "--primary-hover": adjustLightness(primary, hoverDelta),
    "--accent-2": secondary,
    "--accent-2-foreground": secondaryForeground,
    "--accent-2-hover": adjustLightness(secondary, hoverDelta),
  };
}

/**
 * Contrast check for the "Свои цвета" pickers: compares the color against
 * both theme backgrounds (light + dark) and returns a warning message if
 * either falls below the safe WCAG threshold. Never blocks the pick — the
 * caller decides whether to still apply it.
 */
export function accentContrastWarning(hex: string): string | null {
  const lightBg = "#fcfcfd";
  const darkBg = "#121318";
  const worstLight = contrastRatio(hex, lightBg);
  const worstDark = contrastRatio(hex, darkBg);
  if (worstLight < MIN_SAFE_CONTRAST || worstDark < MIN_SAFE_CONTRAST) {
    return "Этот цвет может быть плохо виден на светлом или тёмном фоне.";
  }
  return null;
}

// ── Background personalization ──────────────────────────────────────────

export interface BackgroundSettings {
  /** "default" keeps the app's current neutral background untouched (byte-
   *  identical CSS values, same as accent's default handling). "color" tints
   *  the page background using `color`. "photo" shows an uploaded photo with
   *  a dark scrim (opacity `dimOpacity`) instead of a flat color. */
  mode: "default" | "color" | "photo";
  /** Canonical (user-picked) hex for "color" mode. Re-targeted to a near-
   *  white / near-black lightness per theme by computeBackgroundCssVars, the
   *  same hue-preserving approach as accentForMode(). */
  color: string;
  /** Storage path of an uploaded background photo (quest-photos bucket, see
   *  background-photo.ts) — set only in "photo" mode. */
  photoPath?: string;
  /** Darkening scrim strength over the photo, 0-90. */
  dimOpacity: number;
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  mode: "default",
  color: "#e8d9c3",
  dimOpacity: 55,
};

export interface BackgroundPreset {
  id: string;
  label: string;
  /** null = the "default" neutral preset (no color override at all). */
  color: string | null;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: "neutral", label: "Нейтральный", color: null },
  { id: "cream", label: "Тёплый беж", color: "#e8d9c3" },
  { id: "sage", label: "Мягкая зелень", color: "#cdd9c8" },
  { id: "sky", label: "Прохладное небо", color: "#c8d6e0" },
  { id: "blush", label: "Пудровый розовый", color: "#e8d2d6" },
];

// Lightness targets that keep a background nearly-white in light mode and
// nearly-black in dark mode regardless of the chosen hue — cards (which are
// solid, separately-colored panels) and body text both stay exactly as
// readable as with the current fixed neutral background.
const LIGHT_BG_TARGET_L = 97;
const DARK_BG_TARGET_L = 11;

/** CSS var overrides for the page background in one theme. Empty for "default"/"photo" — those either keep the static CSS value or are handled by a dedicated fixed photo layer instead of a CSS variable. */
export function computeBackgroundCssVars(
  settings: BackgroundSettings,
  mode: "light" | "dark",
): Record<string, string> {
  if (settings.mode !== "color") return {};
  const bg = withLightness(settings.color, mode === "light" ? LIGHT_BG_TARGET_L : DARK_BG_TARGET_L);
  return { "--background": bg };
}

/**
 * Contrast check for a custom background color pick — same WCAG machinery
 * as accentContrastWarning(), just checked against the actual per-theme
 * foreground text color instead of a fixed reference background, since here
 * the background itself is what's changing.
 */
export function backgroundContrastWarning(hex: string): string | null {
  const lightBg = withLightness(hex, LIGHT_BG_TARGET_L);
  const darkBg = withLightness(hex, DARK_BG_TARGET_L);
  const lightOk = contrastRatio(lightBg, "#1a1a1a") >= MIN_SAFE_CONTRAST;
  const darkOk = contrastRatio(darkBg, "#ececf1") >= MIN_SAFE_CONTRAST;
  if (!lightOk || !darkOk) {
    return "Этот фон может плохо сочетаться с текстом на светлой или тёмной теме.";
  }
  return null;
}

// ── Card color personalization ──────────────────────────────────────────

export interface CardColorSettings {
  /** "default" keeps the current white/near-black card surface untouched
   *  (byte-identical CSS values). "color" tints card panels using `color`. */
  mode: "default" | "color";
  /** Canonical (user-picked, mid-lightness) hex. Re-targeted to a pale/dark
   *  card-appropriate lightness per theme by computeCardCssVars — unlike the
   *  background, which stays near-white/near-black to feel like a subtle
   *  backdrop, cards are meant to visibly read as a soft color. */
  color: string;
}

export const DEFAULT_CARD_COLOR: CardColorSettings = { mode: "default", color: "#8264c4" };

export interface CardColorPreset {
  id: string;
  label: string;
  /** null = the "default" neutral preset (no color override at all). */
  color: string | null;
}

export const CARD_COLOR_PRESETS: CardColorPreset[] = [
  { id: "neutral", label: "Нейтральный", color: null },
  { id: "ivory", label: "Слоновая кость", color: "#c98f4a" },
  { id: "mint", label: "Мята", color: "#3f9e7c" },
  { id: "lavender", label: "Лаванда", color: "#8264c4" },
  { id: "rose", label: "Роза", color: "#c15f7c" },
];

// Unlike the background's near-white/near-black targets, cards are meant to
// visibly read as a soft pastel/dark tint — pale but clearly colored in
// light mode, a muted deep tone (lighter than the page background, keeping
// the existing "elevated surface" feel) in dark mode.
const LIGHT_CARD_TARGET_L = 94;
const DARK_CARD_TARGET_L = 22;

const DEFAULT_CARD_HEX = { light: "#ffffff", dark: "#1a1c22" };
const DEFAULT_BG_HEX = { light: "#fcfcfd", dark: "#121318" };
// Neutral text colors actually used elsewhere in the app (not the
// accent-tinted pickForeground defaults), so card text matches the rest of
// the UI's plain foreground/muted-foreground palette.
const FOREGROUND_HEX = { light: "#1a1a1a", dark: "#ececf1" };

function cardColorForMode(settings: CardColorSettings, mode: "light" | "dark"): string {
  if (settings.mode !== "color") return DEFAULT_CARD_HEX[mode];
  return withLightness(settings.color, mode === "light" ? LIGHT_CARD_TARGET_L : DARK_CARD_TARGET_L);
}

function backgroundColorForMode(settings: BackgroundSettings, mode: "light" | "dark"): string {
  if (settings.mode !== "color") return DEFAULT_BG_HEX[mode];
  return withLightness(settings.color, mode === "light" ? LIGHT_BG_TARGET_L : DARK_BG_TARGET_L);
}

/**
 * CSS var overrides for card/panel surfaces in one theme: the card
 * background itself, plus an automatically-derived foreground and muted-
 * foreground so text inside cards always reads clearly against WHATEVER
 * card color is picked — pale card → dark text, dark card → light text —
 * independent of which theme (light/dark) is active. Empty for "default".
 */
export function computeCardCssVars(
  settings: CardColorSettings,
  mode: "light" | "dark",
): Record<string, string> {
  if (settings.mode !== "color") return {};
  const card = cardColorForMode(settings, mode);
  const cardForeground = pickForeground(card, FOREGROUND_HEX.light, FOREGROUND_HEX.dark);
  // A dimmer "secondary text" tone: blend the chosen foreground partway
  // toward the card background, same relationship the fixed
  // foreground/muted-foreground pair already has (muted sits between
  // foreground and the surface it's read against).
  const cardMutedForeground = mixHex(cardForeground, card, 0.42);
  return {
    "--card": card,
    "--card-foreground": cardForeground,
    "--card-muted-foreground": cardMutedForeground,
    "--popover": card,
    "--popover-foreground": cardForeground,
  };
}

/**
 * Warns if the card color and page background end up too visually close to
 * distinguish — WCAG contrast ratio isn't a useful signal here since both
 * are, by design, near-white or near-black in a given theme (so their
 * ratio is always small regardless of hue); a plain RGB distance check is
 * what actually answers "will these blend together". Skipped entirely when
 * neither has been customized — the shipped defaults are already fine.
 */
export function backgroundCardSimilarityWarning(
  background: BackgroundSettings,
  cardColor: CardColorSettings,
): string | null {
  if (background.mode !== "color" && cardColor.mode !== "color") return null;
  const SIMILARITY_THRESHOLD = 10;
  const tooClose = (mode: "light" | "dark") =>
    colorDistance(backgroundColorForMode(background, mode), cardColorForMode(cardColor, mode)) <
    SIMILARITY_THRESHOLD;
  if (tooClose("light") || tooClose("dark")) {
    return "Цвет карточек слишком похож на фон — карточки могут визуально «сливаться» с ним.";
  }
  return null;
}
