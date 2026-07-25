import { useEffect, useState } from "react";
import { getBackgroundPhotoUrl } from "@/lib/background-photo";
import { useGameStateContext } from "@/lib/use-game-state-context";

/**
 * Renders the user's uploaded background photo as a fixed full-viewport
 * layer behind the app, with a dark scrim on top (opacity from
 * background.dimOpacity) so cards and text stay readable in both themes.
 *
 * Only active in "photo" mode. Toggles the "has-bg-photo" class on <html>,
 * which styles.css uses to make html/body/#root transparent — normally they
 * paint an opaque --color-background fill that would otherwise cover this
 * layer entirely (it renders behind in-flow content via z-index: -1, but
 * still in front of the ancestors' own background paint).
 */
export function BackgroundPhotoLayer() {
  const { state } = useGameStateContext();
  const { background } = state;
  const active = background.mode === "photo" && !!background.photoPath;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("has-bg-photo", active);
    return () => document.documentElement.classList.remove("has-bg-photo");
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    if (!active || !background.photoPath) {
      setUrl(null);
      return;
    }
    getBackgroundPhotoUrl(background.photoPath).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [active, background.photoPath]);

  if (!active || !url) return null;

  const dim = Math.min(90, Math.max(0, background.dimOpacity)) / 100;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[-1]"
      style={{
        backgroundImage: `url(${url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0" style={{ background: `rgba(0, 0, 0, ${dim})` }} />
    </div>
  );
}
