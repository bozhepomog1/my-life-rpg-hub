import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeFitnessIndex,
  computeStreak,
  fitnessLevelLabel,
  STAT_META,
  type GameState,
  type StatKey,
} from "@/lib/game";
import { ACHIEVEMENTS } from "@/lib/achievements";

interface Props {
  state: GameState;
  onClose: () => void;
}

const SIZE = 1080;

/** Fixed palette rather than the app's CSS variables: the card is meant to be
 *  posted outside the app, so it should look the same regardless of whether
 *  the user happens to be in light or dark theme when they export it. */
const C = {
  bgTop: "#1c1714",
  bgBottom: "#120f0d",
  frame: "#b8925a",
  text: "#f4efe9",
  muted: "#9a8e83",
  tile: "#241d19",
  accent: "#b8925a",
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  // ctx.roundRect isn't in older Safari; trace it manually so export works everywhere.
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function topStat(state: GameState): StatKey {
  return (Object.keys(state.stats) as StatKey[]).reduce((a, b) =>
    state.stats[a].level * 100 + state.stats[a].xp >= state.stats[b].level * 100 + state.stats[b].xp
      ? a
      : b,
  );
}

/**
 * Renders the character card straight onto a canvas and shows that same
 * canvas as the preview, so what the user sees is byte-identical to the PNG
 * they download — no html-to-canvas rasterization step that could drift from
 * the on-screen markup, and no extra dependency.
 */
export function ShareCardModal({ state, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const streak = computeStreak(state);
  const fitness = computeFitnessIndex(state.body);
  const best = topStat(state);
  const unlocked = Object.keys(state.unlockedAchievements).length;

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.canShare);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const font = (size: number, weight = "600") =>
      `${weight} ${size}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
    grad.addColorStop(0, C.bgTop);
    grad.addColorStop(1, C.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Outer frame
    ctx.strokeStyle = `${C.frame}66`;
    ctx.lineWidth = 3;
    roundRect(ctx, 40, 40, SIZE - 80, SIZE - 80, 40);
    ctx.stroke();

    ctx.textAlign = "center";

    // Header
    ctx.fillStyle = C.muted;
    ctx.font = font(26, "500");
    ctx.fillText("КАРТОЧКА ПЕРСОНАЖА", SIZE / 2, 130);

    // Avatar in a ring
    ctx.strokeStyle = `${C.frame}55`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(SIZE / 2, 265, 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = font(104, "400");
    ctx.textBaseline = "middle";
    ctx.fillText(state.avatar, SIZE / 2, 272);
    ctx.textBaseline = "alphabetic";

    // Name
    ctx.fillStyle = C.text;
    ctx.font = font(64, "700");
    const name = state.name.length > 18 ? `${state.name.slice(0, 17)}…` : state.name;
    ctx.fillText(name, SIZE / 2, 430);

    // Level pill
    const pillW = 260;
    const pillH = 64;
    const pillX = (SIZE - pillW) / 2;
    ctx.fillStyle = `${C.accent}22`;
    roundRect(ctx, pillX, 460, pillW, pillH, 32);
    ctx.fill();
    ctx.strokeStyle = `${C.accent}66`;
    ctx.lineWidth = 2;
    roundRect(ctx, pillX, 460, pillW, pillH, 32);
    ctx.stroke();
    ctx.fillStyle = C.accent;
    ctx.font = font(32, "700");
    ctx.fillText(`УРОВЕНЬ ${state.level}`, SIZE / 2, 503);

    // 2x2 stat tiles
    const tiles: { label: string; value: string; sub?: string }[] = [
      {
        label: "Топ-характеристика",
        value: STAT_META[best].label,
        sub: `${STAT_META[best].icon} Уровень ${state.stats[best].level}`,
      },
      {
        label: "Индекс формы",
        value: fitness == null ? "—" : String(fitness),
        sub: fitness == null ? "не заполнен" : fitnessLevelLabel(fitness),
      },
      { label: "Серия", value: `${streak}`, sub: streak === 1 ? "день подряд" : "дней подряд" },
      { label: "Достижения", value: `${unlocked}`, sub: `из ${ACHIEVEMENTS.length}` },
    ];

    const gap = 28;
    const tileW = (SIZE - 160 - gap) / 2;
    const tileH = 150;
    const startX = 80;
    const startY = 580;

    tiles.forEach((t, i) => {
      const x = startX + (i % 2) * (tileW + gap);
      const y = startY + Math.floor(i / 2) * (tileH + gap);
      ctx.fillStyle = C.tile;
      roundRect(ctx, x, y, tileW, tileH, 24);
      ctx.fill();
      ctx.strokeStyle = "#ffffff10";
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, tileW, tileH, 24);
      ctx.stroke();

      const cx = x + tileW / 2;
      ctx.fillStyle = C.muted;
      ctx.font = font(22, "500");
      ctx.fillText(t.label, cx, y + 44);
      ctx.fillStyle = C.text;
      ctx.font = font(46, "700");
      ctx.fillText(t.value, cx, y + 100);
      if (t.sub) {
        ctx.fillStyle = C.muted;
        ctx.font = font(20, "400");
        ctx.fillText(t.sub, cx, y + 130);
      }
    });

    // Total XP line
    ctx.fillStyle = C.muted;
    ctx.font = font(26, "500");
    ctx.fillText(`${state.totalXp} XP всего · Сезон ${state.season.seasonNumber}`, SIZE / 2, 950);

    // Footer
    ctx.fillStyle = `${C.accent}cc`;
    ctx.font = font(28, "700");
    ctx.fillText("LIFE RPG", SIZE / 2, 1010);
  }, [state, streak, fitness, best, unlocked]);

  useEffect(() => {
    // Fonts may still be loading on first paint; redraw once they're ready so
    // the exported PNG never falls back to a default face mid-render.
    draw();
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) void fonts.ready.then(draw);
  }, [draw]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `life-rpg-${state.name.replace(/\s+/g, "-").toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function share() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "life-rpg.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Моя карточка персонажа — Life RPG" });
        } catch {
          // User dismissed the share sheet — nothing to do.
        }
      } else {
        download();
      }
    }, "image/png");
  }

  return (
    <div
      className="fixed inset-0 z-[160] grid place-items-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel-glow w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Карточка персонажа"
      >
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          className="w-full rounded-2xl"
          aria-label="Карточка персонажа"
        />

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={download}
            className="btn-accent-hover w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5"
          >
            Скачать как изображение
          </button>
          {canNativeShare && (
            <button
              type="button"
              onClick={share}
              className="w-full rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-secondary"
            >
              Поделиться…
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
