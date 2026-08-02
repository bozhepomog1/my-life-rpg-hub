// Supabase Edge Function: parse-meal-photo
//
// Turns a photo of a plate/meal into a list of { name, estimatedGrams } food
// items via Claude's vision API — the photo counterpart to parse-meal-text
// (see that function's index.ts for the general shape this one mirrors: CORS,
// auth check, tool_choice-forced structured output, ANTHROPIC_API_KEY read
// from Edge Function Secrets). Unlike parse-meal-text, this one also returns
// an approximate WEIGHT per item, since that's the actual value photo
// recognition adds over typing a name — see PhotoFoodItem/parseMealPhoto in
// src/lib/nutrition.ts and the "Добавить по фото" button in
// NutritionCalculator.tsx.
//
// Same trust model as parse-meal-text: Claude only ever produces item NAMES
// and a rough gram ESTIMATE, both purely to save typing/guessing on the
// client. The actual calories/macros still come exclusively from the
// existing (audited) Open Food Facts / local FOOD_DB lookup once the client
// runs each recognized name through the normal search step — this function
// never invents or reports nutrition numbers itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = { ...CORS_HEADERS, "content-type": "application/json" };

// Anthropic accepts these four; the client (image-compress.ts) only ever
// sends "image/jpeg", but validating against the full allowed set rather
// than hardcoding just jpeg keeps this function correct if another upload
// path starts feeding it PNGs/WebP directly some day.
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// ~5MB decoded, matching Anthropic's per-image size guidance — base64 runs
// ~33% larger than the decoded bytes, hence the ~6.7MB char-count ceiling.
// Client-side compression (image-compress.ts) targets a much smaller result
// than this in normal operation; this is a server-side backstop for
// whatever slips past it (see Block 4's client-side guard for the primary
// defense).
const MAX_BASE64_CHARS = 7_000_000;

// Sonnet + vision tokens cost noticeably more per call than parse-meal-text's
// Haiku/text-only path, so this limit is tighter — still generous for a
// human photographing a few meals a day, but a much lower ceiling on
// automated abuse than the text limit. Shares its mechanism
// (public.check_rate_limit, rate-limiting-migration.sql) with
// parse-meal-text and find_profile_by_code — see that migration's header
// for the full design writeup.
const RATE_LIMIT_ACTION = "parse_meal_photo";
const RATE_LIMIT_MAX_PER_DAY = 15;
const RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60;

const SYSTEM_PROMPT = `Ты распознаёшь еду на фотографии тарелки или приёма пищи и оцениваешь примерный вес каждого продукта в граммах.

На фото нет объекта для масштаба (линейки, монеты и т.п.) — оценка веса всегда лишь приблизительная, на глаз по объёму и размеру порции относительно тарелки/посуды. Будь консервативен и честен:
- Указывай только продукты, которые ты ДЕЙСТВИТЕЛЬНО уверенно видишь на фото. Не дописывай в список ингредиенты, которых не видно (соусы/специи под слоем еды, состав начинки закрытого блюда и т.п.), даже если они вероятны по контексту.
- Если сомневаешься, стоит ли включать позицию — не включай её, лучше короткий уверенный список, чем длинный и придуманный.
- Если на фото не видно еды, оно слишком тёмное, размытое, снято слишком издалека или просто непонятно, что на нём — верни пустой список items и заполни note коротким понятным объяснением на русском языке (например "На фото не видно еды" или "Фото слишком тёмное, чтобы разобрать блюда").

Всегда вызывай инструмент extract_food_items_with_weight — никогда не отвечай обычным текстом.`;

const EXTRACT_TOOL = {
  name: "extract_food_items_with_weight",
  description:
    "Сохраняет список продуктов/блюд, уверенно распознанных на фото, с примерной оценкой веса каждого в граммах.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Название продукта/блюда в именительном падеже, без веса и количества.",
            },
            estimatedGrams: {
              type: "number",
              description:
                "Примерная оценка веса этой порции в граммах — грубое приближение на глаз, без объекта для масштаба на фото.",
            },
          },
          required: ["name", "estimatedGrams"],
        },
        description:
          "Только продукты, уверенно видимые на фото. Пустой массив, если еда не распознана или фото непригодно.",
      },
      note: {
        type: "string",
        description:
          "Заполняется ТОЛЬКО когда items пустой — короткая, понятная причина на русском языке.",
      },
    },
    required: ["items"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "ANTHROPIC_API_KEY secret is not set (Dashboard → Edge Functions → parse-meal-photo → Secrets).",
      }),
      { status: 500, headers: JSON_HEADERS },
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  // Checked BEFORE reading the request body or calling Claude — see
  // parse-meal-text for the identical pattern and the rationale (never
  // spend the metered vision API call once the user is over their limit).
  const { data: withinLimit, error: rateLimitError } = await supabase.rpc("check_rate_limit", {
    p_action: RATE_LIMIT_ACTION,
    p_limit: RATE_LIMIT_MAX_PER_DAY,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (rateLimitError) {
    console.warn("parse-meal-photo: rate limit check failed", rateLimitError);
  } else if (withinLimit === false) {
    return new Response(
      JSON.stringify({
        items: [],
        rateLimited: true,
        note: "Превышен дневной лимит распознавания фото. Попробуй позже, опиши текстом выше или найди продукт вручную ниже.",
      }),
      { headers: JSON_HEADERS },
    );
  }

  let image = "";
  let mediaType = "";
  try {
    const body = await req.json();
    image = String(body?.image ?? "");
    mediaType = String(body?.mediaType ?? "");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  if (!image) {
    return new Response(JSON.stringify({ items: [], note: "Фото не получено." }), {
      headers: JSON_HEADERS,
    });
  }
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return new Response(
      JSON.stringify({ error: `Unsupported mediaType: ${mediaType || "(empty)"}` }),
      { status: 400, headers: JSON_HEADERS },
    );
  }
  // Server-side backstop on top of the client's own compression (Block 4
  // adds the primary client-side reject-before-upload guard) — cheap to
  // check before spending a metered vision API call on a payload that's
  // going to be rejected or degraded by Anthropic anyway.
  if (image.length > MAX_BASE64_CHARS) {
    return new Response(
      JSON.stringify({
        items: [],
        note: "Фото слишком большое — попробуй сделать снимок ещё раз или выбрать другое.",
      }),
      { headers: JSON_HEADERS },
    );
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: image },
              },
              {
                type: "text",
                text: "Что за еда на этом фото и сколько примерно весит каждая позиция в граммах?",
              },
            ],
          },
        ],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "extract_food_items_with_weight" },
      }),
    });

    if (!res.ok) {
      console.warn("Claude API error", res.status, await res.text());
      return new Response(JSON.stringify({ error: "Claude API request failed" }), {
        status: 502,
        headers: JSON_HEADERS,
      });
    }

    const data = await res.json();
    const toolUse = Array.isArray(data?.content)
      ? data.content.find((block: { type?: string }) => block?.type === "tool_use")
      : undefined;

    if (!toolUse) {
      // Shouldn't happen with tool_choice forcing the call, but don't crash
      // the request over it — log the raw response so it's inspectable in
      // Supabase's Edge Function logs if this ever comes up again.
      console.warn("parse-meal-photo: no tool_use block in response", JSON.stringify(data));
      return new Response(
        JSON.stringify({ items: [], note: "Не удалось разобрать ответ распознавания." }),
        { headers: JSON_HEADERS },
      );
    }

    const rawItems = Array.isArray(toolUse.input?.items) ? toolUse.input.items : [];
    const items = rawItems
      .filter(
        (i: unknown): i is { name: unknown; estimatedGrams: unknown } =>
          typeof i === "object" && i !== null,
      )
      .map((i: { name: unknown; estimatedGrams: unknown }) => ({
        name: typeof i.name === "string" ? i.name.trim() : "",
        estimatedGrams:
          typeof i.estimatedGrams === "number" && Number.isFinite(i.estimatedGrams)
            ? Math.max(0, Math.round(i.estimatedGrams))
            : 0,
      }))
      .filter(
        (i: { name: string; estimatedGrams: number }) => i.name.length > 0 && i.estimatedGrams > 0,
      )
      .slice(0, 10);

    const note = typeof toolUse.input?.note === "string" ? toolUse.input.note.trim() : undefined;

    return new Response(JSON.stringify({ items, note: items.length === 0 ? note : undefined }), {
      headers: JSON_HEADERS,
    });
  } catch (e) {
    console.error("parse-meal-photo failed", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
