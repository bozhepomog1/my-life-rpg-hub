import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { ProgressBar } from "@/components/ProgressBar";
import { FeedbackToast } from "@/components/FeedbackToast";
import {
  NUTRITION_FEEDBACK_MESSAGES,
  pickFeedbackMessage,
  STAT_META,
  type GameState,
  type Macro,
} from "@/lib/game";
import {
  addNutritionEntry,
  amountForEstimatedGrams,
  baseGoals,
  cheatMealsRemaining,
  computeNutritionStreak,
  consumeCheatMeal,
  defaultAmountFor,
  effectiveGoals,
  getTodayNutrition,
  looksLikeMultipleProducts,
  MONTHLY_CHEAT_LIMIT,
  parseMealPhoto,
  parseMealText,
  PORTION_UNIT_LABELS,
  PORTION_UNITS,
  scaledMacro,
  searchProducts,
  suggestedUnitFor,
  sumMacros,
  type MealDraftItem,
  type PortionUnit,
  type ProductCandidate,
} from "@/lib/nutrition";
import { compressImageToBase64 } from "@/lib/image-compress";

interface Props {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}

/** One item waiting for its search→pick→weight turn (see the queue state
 * below) — a plain name from text recognition, or a name + Claude's own
 * approximate gram estimate from photo recognition (Block 3: that estimate
 * prefills the quantity step instead of the usual 100g/1pcs default). */
interface QueueItem {
  name: string;
  estimatedGrams?: number;
}

// Hard reject threshold BEFORE attempting to decode/compress a picked
// photo — compressImageToBase64 already shrinks anything reasonable down
// to a small JPEG, but decoding a huge original (e.g. an uncompressed
// multi-camera panorama, or someone picking a video file mislabeled as an
// image) into a canvas can be slow or memory-heavy on lower-end phones
// before compression even gets a chance to help. 20MB comfortably covers
// any real phone-camera JPEG/HEIC while still catching genuinely
// pathological picks early, with a clear message instead of a silent
// hang or crash.
const MAX_PHOTO_FILE_BYTES = 20 * 1024 * 1024;

const METRICS = [
  { key: "kcal", label: "Ккал", unit: "", color: STAT_META.strength.color },
  { key: "protein", label: "Белки", unit: "г", color: STAT_META.intellect.color },
  { key: "fat", label: "Жиры", unit: "г", color: STAT_META.will.color },
  { key: "carbs", label: "Углеводы", unit: "г", color: STAT_META.appearance.color },
] as const;

export function NutritionCalculator({ state, update }: Props) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ProductCandidate[] | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Block 4: free-text meal entry ("гречка с курицей"). textInput is the
  // raw sentence the user types; parseMealText() (Claude via Edge Function)
  // turns it into a list of item names, which then feed the SAME
  // search→pick→weight flow as manual search, one name at a time —
  // queue[0] is always "the item currently being searched/added", advanced
  // by addCandidate() (on a pick) or skipQueueItem() (if nothing matches).
  const [textInput, setTextInput] = useState("");
  const [parsingText, setParsingText] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  // How many items the CURRENT queue started with — queue itself only holds
  // what's left, so this is what lets the UI show "продукт 2 из 3".
  const [queueTotal, setQueueTotal] = useState(0);

  // Photo meal entry: pick/take a photo, compress it client-side (see
  // image-compress.ts), send it to parse-meal-photo for recognition, then
  // feed the recognized items (name + Claude's own gram estimate) into the
  // SAME queue the text flow uses above — one search→pick→weight step per
  // item, just with the weight step prefilled from the photo instead of a
  // generic default (see addCandidate).
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [draftItems, setDraftItems] = useState<MealDraftItem[]>([]);
  // Brief inline confirmation after an instant-add — cleared by the next
  // search/add so it never goes stale on screen.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<{ id: number; message: string; detail?: string } | null>(
    null,
  );
  const feedbackId = useRef(0);

  const today = getTodayNutrition(state);
  const base = baseGoals(state);
  const goals = effectiveGoals(state);
  const remaining = cheatMealsRemaining(state);

  function handleUseCheatMeal() {
    const captured = { before: base, after: goals };
    update((s) => {
      captured.before = baseGoals(s);
      const next = consumeCheatMeal(s);
      captured.after = effectiveGoals(next);
      return next;
    });
    const carbsDelta = captured.before.carbs - captured.after.carbs;
    const fatDelta = captured.before.fat - captured.after.fat;
    if (carbsDelta <= 0 && fatDelta <= 0) return;
    setFeedback({
      id: ++feedbackId.current,
      message: "Поощрение использовано",
      detail: `Цель по углеводам на сегодня снижена на ${carbsDelta} г (${captured.before.carbs} → ${captured.after.carbs}), по жирам — на ${fatDelta} г (${captured.before.fat} → ${captured.after.fat}). День всё равно останется зелёным в календаре.`,
    });
  }

  /** Runs the actual name search (Open Food Facts + local FOOD_DB) and fills
   * the candidate list — shared by manual search and the text-recognition
   * queue below, since both end up wanting the exact same "search this
   * name" step. */
  async function runSearch(name: string) {
    setSearching(true);
    setCandidates(null);
    try {
      const result = await searchProducts(name);
      setCandidates(result);
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSaved(false);
    setJustAdded(null);
    await runSearch(trimmed);
  }

  /**
   * Instantly adds a candidate to the draft at a sensible default amount
   * (100 г/мл for weight/volume products, 1 шт/порция for counted ones —
   * see suggestedUnitFor/defaultAmountFor), then clears the search so the
   * next product can be searched right away. Replaces the old three-step
   * "pick → set exact quantity on its own screen → confirm added → tap
   * 'add another'" cycle, which meant a full extra screen and click per
   * product when adding a multi-component meal. The exact weight is still
   * fully editable afterward, inline, in the "Текущий приём пищи" list
   * below — so nothing about precision is lost, just reordered: add first,
   * fine-tune the grams after, instead of fine-tuning before every add.
   *
   * When a text- or photo-recognition queue is active (see handleParseText/
   * handlePhotoSelected), adding a candidate also advances to the next
   * recognized item automatically — that's the "спросить по очереди сколько
   * грамм каждого" part, reusing this exact same instant-add-then-edit-weight
   * flow per item. If the queue item currently being resolved came from a
   * photo and carries Claude's own gram estimate, that estimate becomes the
   * starting amount (via amountForEstimatedGrams) instead of the generic
   * default — the user still edits it below like any other value, just
   * starting from an actual guess instead of a blank/generic 100g.
   */
  function addCandidate(candidate: ProductCandidate) {
    const estimatedGrams = queue[0]?.estimatedGrams;
    const unit = suggestedUnitFor(candidate.label);
    const amount =
      estimatedGrams != null
        ? amountForEstimatedGrams(unit, estimatedGrams)
        : defaultAmountFor(unit);
    const item: MealDraftItem = {
      label: candidate.label,
      source: candidate.source,
      base: candidate.base,
      amount,
      unit,
    };
    setDraftItems((prev) => [...prev, item]);
    setJustAdded(candidate.label);
    searchInputRef.current?.focus();
    if (queue.length > 0) {
      advanceQueue();
    } else {
      setQuery("");
      setCandidates(null);
    }
  }

  /** Moves past the current queue[0] (either just added, or explicitly
   * skipped via "Пропустить") and auto-searches the next recognized item,
   * if any. */
  function advanceQueue() {
    const rest = queue.slice(1);
    setQueue(rest);
    if (rest.length > 0) {
      setQuery(rest[0].name);
      void runSearch(rest[0].name);
    } else {
      setQuery("");
      setCandidates(null);
      setQueueTotal(0);
    }
  }

  function skipQueueItem() {
    setJustAdded(null);
    advanceQueue();
  }

  /**
   * Block 4: recognizes individual food items in a free-text meal
   * description via the parse-meal-text Edge Function (Claude API,
   * server-side — see nutrition.ts), then kicks off the same search flow
   * for the first recognized item. Never crashes on failure — parseMealText
   * always resolves, an empty result just shows parseError so the user can
   * fall back to manual search.
   */
  async function handleParseText() {
    const trimmed = textInput.trim();
    if (!trimmed) return;
    setParsingText(true);
    setParseError(null);
    try {
      const { items, note } = await parseMealText(trimmed);
      if (items.length === 0) {
        setParseError(
          note ??
            "Не получилось распознать отдельные продукты в тексте — попробуй переформулировать или найди их вручную ниже.",
        );
        return;
      }
      setTextInput("");
      const wrapped: QueueItem[] = items.map((name) => ({ name }));
      setQueue(wrapped);
      setQueueTotal(wrapped.length);
      setQuery(wrapped[0].name);
      searchInputRef.current?.focus();
      await runSearch(wrapped[0].name);
    } finally {
      setParsingText(false);
    }
  }

  /**
   * Photo meal entry: compress the picked/captured photo client-side
   * (image-compress.ts — keeps the upload small and avoids sending a
   * multi-megabyte camera original), send it to parse-meal-photo for
   * recognition, then feed the recognized items into the exact same queue
   * handleParseText populates above — one search→pick→weight step per item.
   * Unlike the text flow, each queue entry here also carries Claude's own
   * approximate gram estimate (see QueueItem/PhotoFoodItem), which
   * addCandidate() uses to prefill the quantity step instead of the usual
   * 100g/1pcs default — the user still edits it afterward like any other
   * value, just starting from an actual guess.
   */
  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so picking the exact same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    setSaved(false);
    setJustAdded(null);
    setPhotoError(null);

    // Reject before even attempting to decode — see MAX_PHOTO_FILE_BYTES.
    if (file.size > MAX_PHOTO_FILE_BYTES) {
      setPhotoError(
        "Файл слишком большой (лимит 20 МБ) — попробуй сделать фото заново или выбрать другое.",
      );
      return;
    }
    // Some mobile browsers leave `type` empty for camera captures — only
    // reject when it's explicitly set to something non-image, never on a
    // missing/unknown type (that's left to compressImageToBase64's own
    // decode failure, caught below).
    if (file.type && !file.type.startsWith("image/")) {
      setPhotoError("Это не похоже на изображение — выбери файл с фото.");
      return;
    }

    setPhotoBusy(true);
    try {
      const { base64, mediaType } = await compressImageToBase64(file);
      const result = await parseMealPhoto(base64, mediaType);
      if (result.items.length === 0) {
        setPhotoError(
          result.note ??
            "Не получилось распознать еду на фото. Попробуй другое фото, опиши текстом выше или найди продукт вручную ниже.",
        );
        return;
      }
      const wrapped: QueueItem[] = result.items.map((i) => ({
        name: i.name,
        estimatedGrams: i.estimatedGrams,
      }));
      setQueue(wrapped);
      setQueueTotal(wrapped.length);
      setQuery(wrapped[0].name);
      searchInputRef.current?.focus();
      await runSearch(wrapped[0].name);
    } catch (err) {
      console.warn("handlePhotoSelected: failed to process photo", err);
      setPhotoError(
        "Не получилось обработать фото — попробуй ещё раз, опиши текстом выше или найди продукт вручную ниже.",
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  function updateDraftItem(index: number, patch: Partial<Pick<MealDraftItem, "amount" | "unit">>) {
    setDraftItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeDraftItem(index: number) {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  }

  const scaledDraftItems = draftItems.map((it) => ({ label: it.label, ...scaledMacro(it) }));
  const draftTotals: Macro = sumMacros(scaledDraftItems);

  function handleSaveMeal() {
    if (draftItems.length === 0) return;
    // Captured via a mutable holder (not a reassigned `let`) inside the
    // updater, since it must reflect the state AFTER this save (today's
    // running total, and any streak day that just became "complete") — the
    // updater runs synchronously the moment update() is called, so this is
    // safe to read right after.
    const captured: { feedback: { message: string; detail?: string } | null } = { feedback: null };
    update((s) => {
      const next = addNutritionEntry(s, draftItems);
      const goalKcal = effectiveGoals(next).kcal;
      const todayTotal = getTodayNutrition(next).kcal;
      // Only celebrate staying WITHIN goal — going over isn't something to
      // reinforce with a motivating message.
      if (todayTotal > 0 && todayTotal <= goalKcal) {
        const streak = computeNutritionStreak(next);
        captured.feedback = {
          message: pickFeedbackMessage(NUTRITION_FEEDBACK_MESSAGES),
          // Real, not invented — an actual count of consecutive days within goal.
          detail:
            streak > 1
              ? `Это уже ${streak}-й день подряд, когда ты в пределах своей цели по калориям.`
              : undefined,
        };
      }
      return next;
    });
    if (captured.feedback) {
      setFeedback({
        id: ++feedbackId.current,
        message: captured.feedback.message,
        detail: captured.feedback.detail,
      });
    }
    setDraftItems([]);
    setSaved(true);
    setJustAdded(null);
    setQuery("");
    setCandidates(null);
    setQueue([]);
    setQueueTotal(0);
    setParseError(null);
  }

  return (
    <div className="space-y-5">
      {feedback && (
        <FeedbackToast
          key={feedback.id}
          message={feedback.message}
          detail={feedback.detail}
          icon="🥗"
          onDismiss={() => setFeedback(null)}
        />
      )}

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Что ты съел?</h2>

        <div className="mt-3 rounded-xl border border-dashed border-border p-3">
          <label className="text-xs font-medium text-muted-foreground">
            Опиши текстом, что съел
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleParseText()}
              placeholder="Например: гречка с курицей"
              className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={handleParseText}
              disabled={!textInput.trim() || parsingText}
              className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {parsingText ? "Распознаём…" : "Распознать"}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Разберём фразу на отдельные продукты и по очереди спросим вес каждого — точные калории
            всё равно берутся из базы, а не придумываются на лету.
          </p>
          {parseError && (
            <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
              {parseError}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase text-muted-foreground/70">или</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoBusy}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Camera size={15} />
            {photoBusy ? "Распознаём фото…" : "Добавить по фото"}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelected}
            className="hidden"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Сфотографируй тарелку или выбери фото из галереи — распознаем продукты и прикинем вес
            каждого, а точные калории всё равно возьмём из базы.
          </p>
          {photoError && (
            <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
              {photoError}
            </p>
          )}
        </div>

        {queue.length > 0 ? (
          <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
            Продукт {queueTotal - queue.length + 1} из {queueTotal}:{" "}
            <span className="font-medium">{queue[0].name}</span>
            {queue[0].estimatedGrams != null && (
              <span className="text-primary/70"> (~{queue[0].estimatedGrams} г по фото)</span>
            )}{" "}
            — выбери подходящий вариант ниже.{" "}
            <button type="button" onClick={skipQueueItem} className="underline hover:no-underline">
              Пропустить
            </button>
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Или найди продукт по названию вручную — нажми на нужный в списке, он сразу добавится в
            приём пищи с обычным весом (100 г/мл или 1 шт/порция), а точный вес поправишь ниже в
            списке.
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Например: куриная грудка"
            className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={!query.trim() || searching}
            className="shrink-0 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching ? "Ищем…" : "Найти"}
          </button>
        </div>

        {looksLikeMultipleProducts(query) && queue.length === 0 && (
          <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            💡 Похоже, тут два продукта — попробуй найти их по одному (или воспользуйся полем «Опиши
            текстом» выше), каждый добавится отдельной строкой.
          </p>
        )}

        {justAdded && (
          <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            ✅ Добавлено: <span className="text-foreground">{justAdded}</span> — ищи следующий
            продукт или поправь вес в списке ниже.
          </p>
        )}

        {candidates && candidates.length === 0 && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Ничего не найдено ни в Open Food Facts, ни в локальной базе — попробуй другое название.
          </p>
        )}

        {candidates && candidates.length > 0 && (
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
            {candidates.map((c, i) => (
              <li key={c.code ?? `${c.source}-${c.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => addCandidate(c)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:border-primary hover:bg-secondary"
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">{c.label}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {Math.round(c.base.kcal)} ккал
                  </span>
                  <span className="shrink-0 text-[10px] uppercase text-muted-foreground/70">
                    {c.source === "online" ? "OFF" : "локальная"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {draftItems.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground">
              Текущий приём пищи
            </h3>
            <ul className="mt-2 space-y-2">
              {draftItems.map((it, i) => {
                const macro = scaledMacro(it);
                return (
                  <li
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">{it.label}</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={it.amount}
                      onChange={(e) => updateDraftItem(i, { amount: Number(e.target.value) || 0 })}
                      className="w-16 rounded-lg border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary"
                    />
                    <select
                      value={it.unit}
                      onChange={(e) => updateDraftItem(i, { unit: e.target.value as PortionUnit })}
                      className="rounded-lg border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary"
                    >
                      {PORTION_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {PORTION_UNIT_LABELS[u]}
                        </option>
                      ))}
                    </select>
                    <span className="shrink-0 text-muted-foreground">
                      {Math.round(macro.kcal)} ккал
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDraftItem(i)}
                      aria-label="Удалить позицию"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      Удалить
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs">
              <span className="font-medium text-foreground">
                Итого приёма пищи: {Math.round(draftTotals.kcal)} ккал
              </span>
              {" · "}Белки {Math.round(draftTotals.protein)} · Жиры {Math.round(draftTotals.fat)} ·
              Углеводы {Math.round(draftTotals.carbs)}
            </div>

            <button
              type="button"
              onClick={handleSaveMeal}
              className="mt-3 w-full rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5"
            >
              Сохранить в дневник
            </button>
          </div>
        )}

        {saved && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Записано ✅
          </p>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Лимит поощрений на месяц</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Осознанный читмил вместо штрафа: снижает цель по углеводам/жирам на остаток дня, но день
          всё равно остаётся зелёным в календаре — это выбор, а не провал.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">
            {remaining} / {MONTHLY_CHEAT_LIMIT} разрешённых
          </span>
          <button
            type="button"
            onClick={handleUseCheatMeal}
            disabled={remaining <= 0}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Использовать поощрение
          </button>
        </div>
        {remaining <= 0 && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Лимит на этот месяц исчерпан — новые поощрения появятся в следующем месяце.
          </p>
        )}
        {today.cheatMealUsed && (
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Поощрение использовано: цель по углеводам сегодня снижена на {base.carbs - goals.carbs}{" "}
            г ({base.carbs} → {goals.carbs}), по жирам — на {base.fat - goals.fat} г ({base.fat} →{" "}
            {goals.fat}). День всё равно засчитан ✅
          </p>
        )}
      </section>

      <section className="panel p-6">
        <h2 className="mb-4 text-sm font-semibold">Прогресс дня</h2>
        <div className="space-y-4">
          {METRICS.map((m) => {
            const value = today[m.key];
            const goal = goals[m.key];
            const pct = Math.min(100, (value / goal) * 100);
            return (
              <div key={m.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span style={{ color: m.color }}>{m.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(value)} / {goal} {m.unit}
                  </span>
                </div>
                <ProgressBar value={pct} color={m.color} />
              </div>
            );
          })}
        </div>
      </section>

      {today.entries.length > 0 && (
        <section className="panel p-6">
          <h2 className="mb-3 text-sm font-semibold">Записи сегодня</h2>
          <ul className="divide-y divide-border">
            {today.entries
              .slice()
              .reverse()
              .map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate text-muted-foreground">{e.text}</span>
                  <span className="shrink-0 text-xs font-medium text-primary">
                    {Math.round(e.kcal)} ккал
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
