import "server-only";
import { prisma } from "@/lib/prisma";
import { offResponseSchema, type OffProduct } from "./schema";

const OFF_BASE_URL = "https://world.openfoodfacts.org/api/v2/product";
const USER_AGENT = `AsiaToGo/1.0 (${process.env.OFF_CONTACT_EMAIL ?? "kontakt@planimpuls.ch"})`;
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const FIELDS = [
  "code",
  "product_name",
  "product_name_de",
  "brands",
  "quantity",
  "countries_tags",
  "image_front_url",
  "image_ingredients_url",
  "image_nutrition_url",
  "ingredients_text_de",
  "allergens_tags",
  "traces_tags",
  "nutriments",
].join(",");

export interface OffLookupResult {
  found: boolean;
  product?: OffProduct;
  fromCache: boolean;
  /** Anfrage konnte nicht durchgeführt werden (Netzwerk/Timeout/kaputte Antwort) — kein bestätigter Miss. */
  error?: boolean;
}

type FetchOutcome =
  | { status: "hit"; product: OffProduct; raw: unknown }
  | { status: "miss"; raw: unknown }
  | { status: "error" };

async function fetchFromOff(barcode: string): Promise<FetchOutcome> {
  const url = `${OFF_BASE_URL}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    // OFF meldet unbekannte Barcodes inkonsistent: mal HTTP 200 mit leerem
    // Ergebnis, mal HTTP 404 ohne Body. Beides ist ein bestätigter Miss, kein
    // Fehler — siehe .claude/skills/openfoodfacts/SKILL.md.
    if (response.status === 404) {
      return { status: "miss", raw: { code: barcode, status: 0, status_verbose: "http 404" } };
    }
    if (!response.ok) {
      console.error(`[openfoodfacts] HTTP ${response.status} für Barcode ${barcode}`);
      return { status: "error" };
    }

    const json: unknown = await response.json();
    const parsed = offResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error(`[openfoodfacts] Unerwartete Antwortstruktur für Barcode ${barcode}:`, parsed.error.message);
      return { status: "error" };
    }

    return parsed.data.product
      ? { status: "hit", product: parsed.data.product, raw: json }
      : { status: "miss", raw: json };
  } catch (error) {
    console.error(`[openfoodfacts] Fetch fehlgeschlagen für Barcode ${barcode}:`, error);
    return { status: "error" };
  } finally {
    clearTimeout(timeout);
  }
}

function readCachedResponse(rawJson: unknown): OffProduct | undefined {
  const parsed = offResponseSchema.safeParse(rawJson);
  return parsed.success ? parsed.data.product : undefined;
}

/**
 * Cache-first Lookup gegen Open Food Facts. Negative Treffer werden
 * mitgecacht (`found: false`), Netzwerkfehler/Timeouts dagegen **nicht** —
 * sonst würde ein vorübergehender Ausfall einen Artikel für 30 Tage als
 * "nicht gefunden" einfrieren.
 */
export async function fetchOffProduct(barcode: string): Promise<OffLookupResult> {
  const cached = await prisma.offCache.findUnique({ where: { barcode } });

  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    if (!cached.found) return { found: false, fromCache: true };

    const product = readCachedResponse(cached.rawJson);
    if (product) return { found: true, product, fromCache: true };
    // Cache-Eintrag ist beschädigt/veraltet formatiert — neu abrufen statt Fehler weiterreichen.
  }

  const outcome = await fetchFromOff(barcode);
  if (outcome.status === "error") {
    return { found: false, fromCache: false, error: true };
  }

  await prisma.offCache.upsert({
    where: { barcode },
    create: { barcode, rawJson: outcome.raw as object, found: outcome.status === "hit" },
    update: { rawJson: outcome.raw as object, found: outcome.status === "hit", fetchedAt: new Date() },
  });

  return outcome.status === "hit"
    ? { found: true, product: outcome.product, fromCache: false }
    : { found: false, fromCache: false };
}
