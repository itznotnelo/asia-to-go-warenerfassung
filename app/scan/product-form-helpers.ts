import type { MappedOffProduct } from "@/lib/openfoodfacts/mapping";
import type { ContentUnit, DataSource, StorageType, UnitType } from "@/lib/generated/prisma/client";
import type { ProductSummary } from "@/lib/product-summary";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";

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
  notes: string;
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
    notes: product.notes ?? "",
  };
}

// "Alkohol" und alles unter "Non-Food" sind die einzigen Kategorien mit dem erhöhten Satz, siehe swiss-food-compliance.
export function suggestVatRate(category: CategoryOption | undefined): number {
  if (!category) return 2.6;
  if (category.name === "Alkohol" || category.parentName === "Non-Food") return 8.1;
  return 2.6;
}

/**
 * Zwei-Pass-Modus: nur Scan + Kategorie + Preis (die einzigen im Schema
 * Pflichtfelder ausser den hier fest vorbelegten unitType/storageType).
 * Speichert bewusst ohne contentAmount/contentUnit/ingredientsDe/allergens —
 * der Artikel bleibt bis zur Nachbearbeitung im Arbeitsvorrat unvollständig.
 */
export function buildQuickCaptureInput(params: {
  ean: string | null;
  nameDe: string;
  categoryId: string;
  priceRappen: number;
  category: CategoryOption | undefined;
  dataSource: DataSource;
}): SaveProductInput {
  return {
    ean: params.ean,
    nameDe: params.nameDe,
    categoryId: params.categoryId,
    priceRappen: params.priceRappen,
    vatRate: suggestVatRate(params.category),
    unitType: "piece",
    storageType: "ambient",
    allergens: [],
    dataSource: params.dataSource,
  };
}

/**
 * Ctrl+D "letzten Artikel duplizieren" (für Varianten derselben Marke):
 * übernimmt alle Felder des zuletzt gespeicherten Artikels ausser Preis und
 * Inhaltsmenge, die bei einer Variante fast immer abweichen — der Barcode
 * bleibt ohnehin der des aktuell offenen Scans, nicht Teil von FormValues.
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
    notes: lastSaved.notes ?? "",
  };
}
