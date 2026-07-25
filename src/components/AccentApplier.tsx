import { useEffect, useState } from "react";
import { computeAccentCssVars, computeBackgroundCssVars } from "@/lib/personalization";
import { useGameStateContext } from "@/lib/use-game-state-context";

// Every CSS custom property this component might set, so a value chosen in
// one render (e.g. a custom "color" background) can be cleanly reverted to
// the static styles.css default in a later render (e.g. switching back to
// "default"/"photo" mode) by removeProperty() instead of lingering forever.
const MANAGED_KEYS = [
  "--primary",
  "--accent",
  "--ring",
  "--primary-foreground",
  "--accent-foreground",
  "--primary-hover",
  "--accent-2",
  "--accent-2-foreground",
  "--accent-2-hover",
  "--background",
];

/**
 * Applies the user's chosen accent colors AND background color as inline
 * CSS custom-property overrides on <html>. Inline styles always win over
 * the plain :root/.dark rules in styles.css, so this re-themes every
 * `bg-primary`/`text-accent`/etc. Tailwind utility (and the page background)
 * without touching a single component — see the `@theme inline` block at
 * the top of styles.css for how those utilities are wired to these variable
 * names. A background PHOTO isn't handled here — see BackgroundPhotoLayer,
 * which renders an actual fixed image + scrim instead of a CSS variable.
 *
 * Renders nothing. Mounted once near the root, below GameStateProvider so it
 * can read the live state, and above everything else so it applies before
 * the rest of the tree paints with the "wrong" (default) colors.
 */
export function AccentApplier() {
  const { state } = useGameStateContext();
  const dark = useIsDarkMode();

  useEffect(() => {
    const mode = dark ? "dark" : "light";
    const vars: Record<string, string> = {
      ...computeAccentCssVars(state.accentColors, mode),
      ...computeBackgroundCssVars(state.background, mode),
    };
    const root = document.documentElement;
    for (const key of MANAGED_KEYS) {
      if (key in vars) root.style.setProperty(key, vars[key]);
      else root.style.removeProperty(key);
    }
  }, [state.accentColors, state.background, dark]);

  return null;
}

/**
 * Tracks whether <html> currently has the "dark" class. Deliberately
 * independent from useTheme()'s own React state (which only lives inside
 * whichever component called it, e.g. ThemeToggle) — a MutationObserver on
 * the class attribute is the one thing guaranteed to fire no matter which
 * component flips the theme.
 */
function useIsDarkMode(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}
