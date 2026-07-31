// Short, generated Web Audio API sound effects — no audio files, everything
// here is synthesized on the fly (simple sine/triangle/square tones), kept
// under ~0.5s each so they stay unobtrusive. Gated by the caller passing
// state.soundEnabled (see SettingsPanel's "Звуки" toggle) rather than this
// module reading GameState itself, since it has no access to React context.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  // Browsers suspend a freshly-created (or backgrounded) context until a
  // user gesture — every call site here is already inside a click handler,
  // so resuming is always safe to attempt.
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** One short tone: a quick attack + exponential decay so it reads as a
 * "blip" rather than a harsh on/off click. */
function tone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = "sine",
  peakGain = 0.15,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const start = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Quest completed — a quick two-note upward "blip". */
export function playQuestComplete(enabled: boolean) {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 660, 0, 0.11, "sine", 0.14);
  tone(ctx, 880, 0.07, 0.14, "sine", 0.14);
}

/** Level up — a small 4-note ascending arpeggio, the most celebratory of
 * the four since it's the rarest event. */
export function playLevelUp(enabled: boolean) {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
    tone(ctx, freq, i * 0.09, 0.18, "triangle", 0.16),
  );
}

/** Achievement unlocked — a brighter two-note chime, distinct in timbre
 * (square wave) from the quest-complete sine blip. */
export function playAchievementUnlock(enabled: boolean) {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 784, 0, 0.1, "square", 0.1);
  tone(ctx, 988, 0.09, 0.2, "square", 0.1);
}

/** Shop item purchased/unlocked — a soft descending "coin" blip. */
export function playShopPurchase(enabled: boolean) {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 440, 0, 0.08, "sine", 0.14);
  tone(ctx, 330, 0.06, 0.12, "sine", 0.1);
}
