// Supabase Edge Function: parse-meal-text
//
// Turns a free-text meal description ("гречка с курицей") into a list of
// individual food item names (["гречка", "курица"]) that the client then
// runs through the existing searchProducts()/local-FOOD_DB flow ONE AT A
// TIME, asking for the weight of each in turn — see parseMealText() in
// src/lib/nutrition.ts and the "Опиши текстом" section of
// NutritionCalculator.tsx. This function only extracts item names; it never
// invents quantities or macros itself, so the app's existing (and already
// audited) nutrition data stays the single source of truth for numbers.
//
// Calls the Claude API directly over HTTPS — no SDK needed for a single
// non-streaming request. The API key is read from the ANTHROPIC_API_KEY
// secret (Dashboard → Edge Functions → parse-meal-text → Secrets, or
// `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`) — never hardcoded
// here or committed anywhere in the repo.
//
// Unlike send-daily-reminders (invoked by pg_cron with no user session, so
// it needs `--no-verify-jwt` at deploy time), this function is always
// called from a logged-in user's browser via supabase.functions.invoke(),
// which attaches their session JWT automatically — so it's deployed with
// the platform's default JWT verification, plus an explicit auth.getUser()
// check below as a second guard (this endpoint costs a metered Claude API
// call per request, so it shouldn't be reachable without a valid session
// even if verify_jwt were ever accidentally disabled).
import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
// SUPABASE_URL / SUPABASE_ANON_KEY are auto-injected into every Edge
// Function's environment by the platform — no manual secret needed for
// these two, unlike ANTHROPIC_API_KEY above.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = { ...CORS_HEADERS, "content-type": "application/json" };

// Original v1 of this function asked Claude to "return ONLY a JSON array"
// in plain text and parsed that with JSON.parse (after stripping ``` fences).
// That's brittle: a fast/terse model like Haiku will sometimes wrap a short
// or single-word input in a stray sentence ("Единственный продукт: [\"творог\"]")
// despite the instruction, which broke JSON.parse and silently produced [] —
// exactly the "even a single simple product doesn't work" bug reported. This
// version instead forces a tool call with a strict input_schema via
// tool_choice, so the Messages API itself guarantees `input.items` is a
// validated array of strings — no free-text JSON to parse or fail on.
const SYSTEM_PROMPT = `Ты извлекаешь отдельные продукты питания из фразы пользователя о том, что он съел, на русском языке.
Пользователь может описать один продукт ("творог", "яблоко") или несколько сразу, через "и", запятую или предлог "с" ("гречка с курицей", "омлет, тост и апельсиновый сок").
Всегда вызывай инструмент extract_food_items со списком названий в именительном падеже, без количества и веса.
Один продукт — список из одного элемента, например ["творог"]. Несколько продуктов — по одному элементу на каждый.
Если фраза явно не описывает еду, вызови инструмент с пустым списком items.`;

const EXTRACT_TOOL = {
  name: "extract_food_items",
  description:
    "Сохраняет список отдельных продуктов/блюд, распознанных во фразе пользователя о приёме пищи.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: { type: "string" },
        description:
          "Названия отдельных продуктов или блюд в именительном падеже, без количества и веса. " +
          "Один продукт в тексте — массив из одного элемента. Пустой массив, если текст не про еду.",
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
          "ANTHROPIC_API_KEY secret is not set (Dashboard → Edge Functions → parse-meal-text → Secrets).",
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

  let text = "";
  try {
    const body = await req.json();
    text = String(body?.text ?? "").trim();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  // Empty or absurdly long input isn't worth a Claude API call — same
  // "cheap no-op" spirit as searchProducts()'s empty-query guard client-side.
  if (!text || text.length > 500) {
    return new Response(JSON.stringify({ items: [] }), { headers: JSON_HEADERS });
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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
        tools: [EXTRACT_TOOL],
        // Forces Claude to always respond via the tool call (never plain
        // text), so `input.items` below is guaranteed to already be a
        // schema-validated array — nothing to JSON.parse or fail on.
        tool_choice: { type: "tool", name: "extract_food_items" },
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
      console.warn("parse-meal-text: no tool_use block in response", JSON.stringify(data));
      return new Response(JSON.stringify({ items: [] }), { headers: JSON_HEADERS });
    }

    const rawItems = toolUse.input?.items;
    const items = Array.isArray(rawItems)
      ? rawItems
          .filter((i: unknown): i is string => typeof i === "string" && i.trim().length > 0)
          .slice(0, 10)
      : [];

    return new Response(JSON.stringify({ items }), { headers: JSON_HEADERS });
  } catch (e) {
    console.error("parse-meal-text failed", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
