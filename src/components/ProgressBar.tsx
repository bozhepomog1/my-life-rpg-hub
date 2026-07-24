import { useEffect, useRef, useState } from "react";

interface Props {
  /** 0-100 */
  value: number;
  /** Optional per-item color (e.g. a stat's color). Defaults to the theme accent. */
  color?: string;
}

/**
 * A progress bar that animates from 0 on first mount (so the page doesn't
 * just appear already-filled), then transitions smoothly on later value
 * changes via the .bar-fill CSS transition.
 */
export function ProgressBar({ value, color }: Props) {
  const [width, setWidth] = useState(0);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      // Double rAF: let the 0%-width first paint commit before animating up,
      // otherwise the browser can coalesce both states into one frame.
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setWidth(value));
      });
      return () => cancelAnimationFrame(id);
    }
    setWidth(value);
  }, [value]);

  return (
    <div className="bar-track" style={color ? { background: `${color}18` } : undefined}>
      <div className="bar-fill" style={{ width: `${width}%`, background: color ?? "var(--color-accent)" }} />
    </div>
  );
}
