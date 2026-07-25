/**
 * Small, dependency-free color-math helpers used by the accent-color
 * personalization feature (Settings → Персонализация).
 *
 * Everything here works on plain 6-digit hex strings ("#rrggbb") so it can be
 * fed straight from/to <input type="color"> without any parsing on the
 * caller's side.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

/** Returns null for anything that isn't a valid #rrggbb hex string. */
export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function isValidHex(hex: string): boolean {
  return hexToRgb(hex) !== null;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, "0")).join("")}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const sN = s / 100;
  const lN = l / 100;
  if (sN === 0) {
    const v = lN * 255;
    return { r: v, g: v, b: v };
  }
  const q = lN < 0.5 ? lN * (1 + sN) : lN + sN - lN * sN;
  const p = 2 * lN - q;
  const hk = h / 360;
  return {
    r: hue2rgb(p, q, hk + 1 / 3) * 255,
    g: hue2rgb(p, q, hk) * 255,
    b: hue2rgb(p, q, hk - 1 / 3) * 255,
  };
}

/** Shifts a hex color's HSL lightness by `deltaPercent` points (can be negative), clamped to [0,100]. Used to derive hover/lighter-darker shades without asking the user to pick them by hand. */
export function adjustLightness(hex: string, deltaPercent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  const l = Math.max(0, Math.min(100, hsl.l + deltaPercent));
  return rgbToHex(hslToRgb({ ...hsl, l }));
}

/** Sets a hex color's HSL lightness to an absolute target percentage, keeping its hue/saturation (i.e. the user's actual color choice). Used to adapt one user-picked accent to both the light and dark theme. */
export function withLightness(hex: string, targetLPercent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  return rgbToHex(hslToRgb({ ...hsl, l: Math.max(0, Math.min(100, targetLPercent)) }));
}

// Lightness values that read well against this app's card/background colors,
// matched to the existing terracotta accent's measured lightness in each
// theme (~46% in light, ~65% in dark) so a custom color lands in the same
// "feels right here" range.
const LIGHT_ACCENT_TARGET_L = 46;
const DARK_ACCENT_TARGET_L = 65;

/** Adapts a user-chosen accent hex so it reads correctly in a specific theme. */
export function accentForMode(hex: string, mode: "light" | "dark"): string {
  return withLightness(hex, mode === "light" ? LIGHT_ACCENT_TARGET_L : DARK_ACCENT_TARGET_L);
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const chan = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
}

/** WCAG contrast ratio between two colors: 1 (no contrast) to 21 (max). */
export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Minimum contrast ratio against the background we consider "safe enough" to
 * not warn about. WCAG AA calls for 4.5:1 for body text and 3:1 for large
 * text/UI components; accents in this app are mostly used on solid buttons
 * (which get their own computed foreground color, always readable) or as
 * colored text/icons on the neutral background, so 3:1 — the AA threshold
 * for that latter case — is the right bar rather than the stricter 4.5:1.
 */
export const MIN_SAFE_CONTRAST = 3;

/** Picks whichever of the two candidate foregrounds contrasts better against bgHex. */
export function pickForeground(bgHex: string, light = "#fefdfb", dark = "#201510"): string {
  return contrastRatio(bgHex, light) >= contrastRatio(bgHex, dark) ? light : dark;
}
