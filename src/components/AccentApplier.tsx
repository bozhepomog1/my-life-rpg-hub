import { useEffect, useState } from "react";
import { computeAccentCssVars } from "@/lib/personalization";
import { useGameStateContext } from "@/lib/use-game-state-context";

/**
 * Applies the user's chosen accent colors as inline CSS custom-property
 * overrides on <html>. Inline styles always win over the plain :root/.dark
 * rules in styles.css, so this re-themes every `bg-primary`/`text-accent`/
 * etc. Tailwind utility in the app without touching a single component —
 * see the `@theme inline` block at the top of styles.css for how those
 * utilities are wired to these variable names.
 *
 * Renders nothing. Mounted once near the root, below GameStateProvider so it
 * can read the live accentColors, and above everything else so it applies
 * before the rest of the tree paints with the "wrong" (default) colors.
 */
export function AccentApplier() {
  const { state } = useGameStateContext();
  const dark = useIsDarkMode();

  useEffect(() => {
    const vars = computeAccentCssVars(state.accentColors, dark ? "dark" : "light");
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, [state.accentColors, dark]);

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
