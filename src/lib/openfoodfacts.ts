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
// Raised from 5: an ambiguous query like "хлопья" (flakes) legitimately
// matches several distinct product types (corn flakes, oat flakes, glazed
// flakes, ...) — 5 slots meant the "choose" list often only showed one or
// two of those types before running out of room. 10 gives the user enough
// variety to actually find the one they meant, while the UI list itself
// gets an internal scroll (see NutritionCalculator.tsx) so it doesn't
// balloon the page.
const MAX_RESULTS = 10;

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
 * Sorted by OFF's own popularity signal (unique_scans_n, descending) so
 * common/recognizable products surface ahead of niche ones for ambiguous
 * queries like "хлопья".
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
      // search_terms/search_simple already searches by keyword rather than
      // restricting to one category, so a broad query like "хлопья" was
      // never narrowed to a single product type by the query itself — the
      // low page_size above was the actual bottleneck (fixed by raising
      // MAX_RESULTS). This sort_by is the other half of the ask: without
      // it OFF's default order is close to arbitrary/insertion-order, which
      // tends to surface obscure single-scan entries ahead of products
      // people actually recognize. unique_scans_n is OFF's own popularity
      // signal (how many people have scanned/looked up the product), so
      // sorting by it descending puts recognizable, common products first.
      sort_by: "unique_scans_n",
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
