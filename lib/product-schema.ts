import { z } from "zod";
import { VAT_RATES } from "@/lib/pricing";
import { ALLERGEN_KEYS } from "@/lib/allergens";
import { isValidBarcode, normalizeGtin } from "@/lib/barcode";

// Server actions are plain POST endpoints, so the UI <select> is not enough to keep 7.7 or 0 out.
export const vatRateSchema = z.number().refine((rate) => VAT_RATES.includes(rate), "MwSt muss 2.6 % oder 8.1 % sein");

// CHF 10'000. Far above any shop article, far below int4, and it stops a
// scanned EAN that slipped into a price field from being saved as a price.
export const MAX_PRICE_RAPPEN = 1_000_000;

export const priceRappenSchema = z
  .number()
  .int()
  .positive("Preis muss positiv sein")
  .max(MAX_PRICE_RAPPEN, "Preis ist zu hoch (höchstens CHF 10'000)");

// Unknown keys would reach the shop as allergen data, so only the 14 canonical ones pass.
const allergenListSchema = z
  .array(z.string().refine((key) => ALLERGEN_KEYS.includes(key), "Unbekanntes Allergen"))
  .default([]);

export const productInputSchema = z.object({
  ean: z
    .string()
    .trim()
    .nullable()
    .transform((value) => (value ? (normalizeGtin(value) ?? value) : null))
    .refine((value) => value === null || isValidBarcode(value), "Ungültiger Barcode (Prüfziffer falsch)"),
  nameDe: z.string().trim().min(1, "Name ist Pflicht"),
  nameOriginal: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  originCountry: z.string().trim().length(2, "Bitte 2 Buchstaben eingeben, z.B. TH").optional(),
  categoryId: z.string().min(1, "Kategorie ist Pflicht"),
  priceRappen: priceRappenSchema,
  vatRate: vatRateSchema,
  unitType: z.enum(["piece", "weight", "volume"]),
  contentAmount: z.number().positive("Inhaltsmenge muss grösser als 0 sein").optional(),
  contentUnit: z.enum(["g", "kg", "ml", "l", "stk"]).optional(),
  storageType: z.enum(["ambient", "chilled", "frozen"]),
  ingredientsDe: z.string().trim().optional(),
  allergens: allergenListSchema,
  traces: allergenListSchema,
  // Only the user's tick sets this (hard rule 5); OFF/AI pre-fill never does.
  allergensConfirmed: z.boolean().default(false),
  notes: z.string().trim().optional(),
  dataSource: z.enum(["openfoodfacts", "manual", "ai_extracted"]),
});

export type ProductInput = z.infer<typeof productInputSchema>;

interface CompletionFields {
  nameDe: string;
  priceRappen: number;
  contentAmount?: number | null;
  contentUnit?: string | null;
  ingredientsDe?: string | null;
  allergensConfirmed: boolean;
}

function hasRequiredCompletionFields(fields: CompletionFields): boolean {
  return Boolean(
    fields.nameDe &&
      fields.priceRappen > 0 &&
      fields.contentAmount &&
      fields.contentUnit &&
      fields.ingredientsDe &&
      fields.allergensConfirmed,
  );
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key) => b.includes(key));
}

/**
 * allergensConfirmedAt for a save: null unless the user ticked "Allergene
 * geprüft". An earlier confirmation is kept only if the lists are unchanged,
 * so the timestamp always says when the current lists were checked.
 */
export function allergensConfirmedAtFor(
  input: { allergensConfirmed: boolean; allergens: string[]; traces: string[] },
  existing: { allergensConfirmedAt: Date | null; allergens: string[]; traces: string[] } | null,
  now: Date,
): Date | null {
  if (!input.allergensConfirmed) return null;
  if (
    existing?.allergensConfirmedAt &&
    sameKeys(existing.allergens, input.allergens) &&
    sameKeys(existing.traces, input.traces)
  ) {
    return existing.allergensConfirmedAt;
  }
  return now;
}

// Pflichtfelder für den Shop-Auftritt, siehe .claude/skills/swiss-food-compliance/SKILL.md.
// `hasImage` kommt vom Aufrufer statt aus einem DB-Lookup hier drin, damit
// diese Funktion rein bleibt und ohne Datenbank testbar ist.
export function computeDataComplete(input: ProductInput, hasImage: boolean): boolean {
  return hasRequiredCompletionFields(input) && hasImage;
}

/**
 * Dieselbe Regel, aber für einen bereits gespeicherten Artikel (z.B. nach
 * einem nachträglichen Bild-Upload) statt für frisches Formular-Input.
 */
export function isProductComplete(product: CompletionFields, hasImage: boolean): boolean {
  return hasRequiredCompletionFields(product) && hasImage;
}
