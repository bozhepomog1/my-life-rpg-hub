import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-all hover:scale-110 hover:text-foreground hover:border-foreground/30"
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
