/**
 * Client for Open Food Facts' free, public, key-less product search API
 * (https://world.openfoodfacts.org/data — "cgi/search.pl" endpoint). Used
 * by the nutrition calculator to look up real products by name, in
 * addition to the local FOOD_DB in nutrition.ts.
 *
 * Deliberately never throws: any failure (network unreachable, request
 * timeout, malformed JSON, a product missing usable nutriment data) simply
 * results in an empty array, so callers can always fall back to the local
 * database instead of showing an error.
 */

export interface OffProduct {
  /** OFF barcode, or a synthesized fallback if a product has none. */
  code: string;
  /** Product name, with brand appended in parentheses if present. */
  label: string;
  // All four values are PER 100G of the product, matching this app's
  // existing per-100g convention for raw/cooked ingredients (see the
  // file-level comment in nutrition.ts).
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

const SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const REQUEST_TIMEOUT_MS = 6000;
const MAX_RESULTS = 5;

interface RawOffProduct {
  code?: string;
  product_name?: string;
  product_name_ru?: string;
  brands?: string;
  nutriments?: Record<string, unknown>;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Searches Open Food Facts for products matching `query` (supports
 * Russian and other languages — OFF stores localized names per product,
 * preferring product_name_ru when present). Returns up to MAX_RESULTS
 * products that have complete kcal/protein/fat/carbs data — products
 * missing any of these are skipped rather than shown as misleading zeros.
 */
export async function searchOpenFoodFacts(query: string): Promise<OffProduct[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      search_terms: trimmed,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: String(MAX_RESULTS),
      fields: "code,product_name,product_name_ru,brands,nutriments",
    });
    const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];

    const data: unknown = await res.json();
    const products = Array.isArray((data as { products?: unknown })?.products)
      ? ((data as { products: RawOffProduct[] }).products as RawOffProduct[])
      : [];

    const out: OffProduct[] = [];
    for (const p of products) {
      const name = p.product_name_ru?.trim() || p.product_name?.trim();
      if (!name) continue;

      const n = p.nutriments ?? {};
      const kcal = n["energy-kcal_100g"];
      const protein = n["proteins_100g"];
      const fat = n["fat_100g"];
      const carbs = n["carbohydrates_100g"];
      if (![kcal, protein, fat, carbs].every(isFiniteNumber)) continue;

      out.push({
        code: p.code || `${name}-${out.length}`,
        label: p.brands ? `${name} (${p.brands})` : name,
        kcal: kcal as number,
        protein: protein as number,
        fat: fat as number,
        carbs: carbs as number,
      });
    }
    return out;
  } catch {
    // Network error, abort/timeout, non-JSON response, CORS failure — all
    // treated the same way: no online results, caller falls back to local.
    return [];
  } finally {
    clearTimeout(timer);
  }
}
