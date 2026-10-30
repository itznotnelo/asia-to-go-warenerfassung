import type { MappedOffProduct } from "@/lib/openfoodfacts/mapping";
import type { Nutrition } from "@/lib/nutrition";
import type { ContentUnit, DataSource, StorageType, UnitType } from "@/lib/generated/prisma/client";
import type { ProductSummary } from "@/lib/product-summary";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";
import { CONTENT_AMOUNT_ERROR, parseChfToRappen, parseContentAmount, PRICE_ERROR } from "@/lib/pricing";
import { VAT_RATE_BY_SLUG } from "@/electron/src/category-tree";

export interface FormValues {
  nameDe: string;
  nameOriginal: string;
  brand: string;
  originCountry: string;
  categoryId: string;
  priceChf: string;
  vatRate: number;
  unitType: UnitType;
  contentAmount: string;
  contentUnit: ContentUnit | "";
  storageType: StorageType;
  ingredientsDe: string;
  allergens: string[];
  traces: string[];
  /** The "Allergene geprüft" tick. Never pre-set from OFF (hard rule 5). */
  allergensConfirmed: boolean;
  notes: string;
  /** OFF nutrition per 100 g/ml, not editable, passed through to the save. */
  nutrition?: Nutrition;
}

export const EMPTY_VALUES: FormValues = {
  nameDe: "",
  nameOriginal: "",
  brand: "",
  originCountry: "",
  categoryId: "",
  priceChf: "",
  vatRate: 2.6,
  unitType: "piece",
  contentAmount: "",
  contentUnit: "",
  storageType: "ambient",
  ingredientsDe: "",
  allergens: [],
  traces: [],
  allergensConfirmed: false,
  notes: "",
};

/** Wandelt einen OFF-Treffer in Formularwerte + die Liste der Felder, die als "von OFF übernommen" markiert werden. */
export function mappedOffToFormValues(mapped: MappedOffProduct): { initial: Partial<FormValues>; sourced: Set<keyof FormValues> } {
  const initial: Partial<FormValues> = {};
  const sourced = new Set<keyof FormValues>();

  function set<K extends keyof FormValues>(key: K, value: FormValues[K] | undefined | null) {
    if (value === undefined || value === null || value === "") return;
    initial[key] = value;
    sourced.add(key);
  }

  set("nameDe", mapped.nameDe);
  set("nameOriginal", mapped.nameOriginal);
  set("brand", mapped.brand);
  set("originCountry", mapped.originCountry);
  set("contentAmount", mapped.contentAmount !== undefined ? String(mapped.contentAmount) : undefined);
  set("contentUnit", mapped.contentUnit);
  set("ingredientsDe", mapped.ingredientsDe);
  if (mapped.allergens.length > 0) {
    initial.allergens = mapped.allergens;
    sourced.add("allergens");
  }
  if (mapped.traces.length > 0) {
    initial.traces = mapped.traces;
    sourced.add("traces");
  }
  // OFF lists are suggestions only: allergensConfirmed stays false (hard rule 5).
  // Not marked as sourced: no field shows it, it only rides along to the save.
  if (mapped.nutrition) initial.nutrition = mapped.nutrition;

  return { initial, sourced };
}

/** Für die Detailseite in /products/[id] — Kehrfunktion zum Speichern, ein bestehender Artikel als editierbares Formular. */
export function productSummaryToFormValues(product: ProductSummary): FormValues {
  return {
    nameDe: product.nameDe,
    nameOriginal: product.nameOriginal ?? "",
    brand: product.brand ?? "",
    originCountry: product.originCountry ?? "",
    categoryId: product.categoryId,
    priceChf: (product.priceRappen / 100).toFixed(2),
    vatRate: product.vatRate,
    unitType: product.unitType,
    contentAmount: product.contentAmount !== null ? String(product.contentAmount) : "",
    contentUnit: product.contentUnit ?? "",
    storageType: product.storageType,
    ingredientsDe: product.ingredientsDe ?? "",
    allergens: product.allergens,
    traces: product.traces,
    allergensConfirmed: product.allergensConfirmed,
    notes: product.notes ?? "",
  };
}

export type NumberFieldErrors = Partial<Record<"priceChf" | "contentAmount", string>>;

export type ParsedFormNumbers =
  | { ok: true; priceRappen: number; contentAmount: number | undefined }
  | { ok: false; errors: NumberFieldErrors };

/**
 * Preis und Inhaltsmenge streng parsen, bevor gespeichert wird. Lieber eine
 * Feldmeldung als ein falscher Preis ("1'250" war mit parseFloat CHF 1.00).
 */
export function parseFormNumbers(values: Pick<FormValues, "priceChf" | "contentAmount">): ParsedFormNumbers {
  const errors: NumberFieldErrors = {};
  const priceRappen = parseChfToRappen(values.priceChf);
  if (priceRappen === null || priceRappen <= 0) errors.priceChf = PRICE_ERROR;

  let contentAmount: number | undefined;
  if (values.contentAmount.trim() !== "") {
    const parsed = parseContentAmount(values.contentAmount);
    if (parsed === null || parsed <= 0) errors.contentAmount = CONTENT_AMOUNT_ERROR;
    else contentAmount = parsed;
  }

  if (priceRappen === null || priceRappen <= 0 || errors.contentAmount) return { ok: false, errors };
  return { ok: true, priceRappen, contentAmount };
}

/** Option labels for every MwSt select, so Papa sees why without reading rules. */
export const VAT_OPTIONS: readonly { rate: number; label: string }[] = [
  { rate: 2.6, label: "2.6 % (Lebensmittel)" },
  { rate: 8.1, label: "8.1 % (Alkohol, Haushalt, Kosmetik)" },
];

// Keyed on the slug, not the display name, so renaming a category can't flip the rate.
// A sub-category the tree doesn't know (added later) inherits from its parent.
export function suggestVatRate(category: Pick<CategoryOption, "slug" | "parentSlug"> | undefined): number {
  if (!category) return 2.6;
  const own = VAT_RATE_BY_SLUG.get(category.slug);
  const inherited = category.parentSlug ? VAT_RATE_BY_SLUG.get(category.parentSlug) : undefined;
  return own ?? inherited ?? 2.6;
}

/**
 * What a category change does to the MwSt field. Until the user picks a rate by hand
 * (vatTouched), the rate follows the category. After that it stays, and `suggested`
 * carries the category's rate whenever it differs, for a visible hint.
 */
export function vatAfterCategoryChange(
  currentRate: number,
  vatTouched: boolean,
  category: Pick<CategoryOption, "slug" | "parentSlug"> | undefined,
): { vatRate: number; suggested: number | null } {
  const suggestion = suggestVatRate(category);
  if (!vatTouched) return { vatRate: suggestion, suggested: null };
  return { vatRate: currentRate, suggested: suggestion === currentRate ? null : suggestion };
}

/**
 * Zwei-Pass-Modus: nur Scan + Kategorie + Preis + MwSt (die einzigen im Schema
 * Pflichtfelder ausser den hier fest vorbelegten unitType/storageType).
 * Speichert bewusst ohne contentAmount/contentUnit/ingredientsDe/allergens —
 * der Artikel bleibt bis zur Nachbearbeitung im Arbeitsvorrat unvollständig.
 * vatRate is the rate shown on screen, never a silent category lookup.
 */
export function buildQuickCaptureInput(params: {
  ean: string | null;
  nameDe: string;
  categoryId: string;
  priceRappen: number;
  vatRate: number;
  dataSource: DataSource;
}): SaveProductInput {
  return {
    ean: params.ean,
    nameDe: params.nameDe,
    categoryId: params.categoryId,
    priceRappen: params.priceRappen,
    vatRate: params.vatRate,
    unitType: "piece",
    storageType: "ambient",
    allergens: [],
    traces: [],
    allergensConfirmed: false,
    dataSource: params.dataSource,
  };
}

/**
 * Ctrl+D "letzten Artikel duplizieren" (für Varianten derselben Marke):
 * übernimmt alle Felder des zuletzt gespeicherten Artikels ausser Preis und
 * Inhaltsmenge, die bei einer Variante fast immer abweichen — der Barcode
 * bleibt ohnehin der des aktuell offenen Scans, nicht Teil von FormValues.
 * Allergene werden übernommen, die Prüfung nicht: eine Variante kann andere
 * Allergene haben, also muss sie jemand neu bestätigen.
 * Nutrition is not copied either: it belongs to the scanned article.
 */
export function duplicatedFieldsFromLastSaved(lastSaved: SaveProductInput): Partial<FormValues> {
  return {
    nameDe: lastSaved.nameDe,
    nameOriginal: lastSaved.nameOriginal ?? "",
    brand: lastSaved.brand ?? "",
    originCountry: lastSaved.originCountry ?? "",
    categoryId: lastSaved.categoryId,
    vatRate: lastSaved.vatRate,
    unitType: lastSaved.unitType,
    contentUnit: lastSaved.contentUnit ?? "",
    storageType: lastSaved.storageType,
    ingredientsDe: lastSaved.ingredientsDe ?? "",
    allergens: lastSaved.allergens,
    traces: lastSaved.traces,
    allergensConfirmed: false,
    notes: lastSaved.notes ?? "",
  };
}
