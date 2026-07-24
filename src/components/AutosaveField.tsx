import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

interface Props {
  /** Current committed value, as a string. */
  value: string;
  /**
   * Persist the raw draft. Return true if a save actually happened (so the
   * "Сохранено" tick only flashes on a real change) or false to skip (empty
   * input, unchanged value, etc.).
   */
  onCommit: (raw: string) => boolean;
  type?: "text" | "number";
  placeholder?: string;
  min?: number;
  ariaLabel?: string;
  debounceMs?: number;
}

/**
 * Self-saving input: commits on blur and after a debounce once the user
 * stops typing — no explicit Save button. Shows a brief check icon after a
 * successful save for feedback.
 */
export function AutosaveField({
  value,
  onCommit,
  type = "text",
  placeholder,
  min,
  ariaLabel,
  debounceMs = 800,
}: Props) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedRef = useRef(value);

  // Re-sync when the external value changes: our own commit normalizing the
  // input, a full-state reset, or a cross-device sync.
  useEffect(() => {
    committedRef.current = value;
    setDraft(value);
  }, [value]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedRef.current) clearTimeout(savedRef.current);
    },
    [],
  );

  function flashSaved() {
    setSaved(true);
    if (savedRef.current) clearTimeout(savedRef.current);
    savedRef.current = setTimeout(() => setSaved(false), 1400);
  }

  function commit(raw: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (raw === committedRef.current) return;
    const didSave = onCommit(raw);
    committedRef.current = raw;
    if (didSave) flashSaved();
  }

  function handleChange(v: string) {
    setDraft(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(v), debounceMs);
  }

  return (
    <div className="relative">
      <input
        type={type}
        min={min}
        value={draft}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => commit(draft)}
        className="w-full rounded-xl border border-border bg-input px-3 py-2 pr-9 text-sm outline-none focus:border-primary"
      />
      <span
        className={`pointer-events-none absolute inset-y-0 right-3 flex items-center text-success transition-opacity duration-200 ${
          saved ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden={!saved}
      >
        <Check size={16} />
        <span className="ml-1 text-xs font-medium">Сохранено</span>
      </span>
    </div>
  );
}
