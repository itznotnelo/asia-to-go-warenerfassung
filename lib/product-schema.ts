import { z } from "zod";

export const productInputSchema = z.object({
  ean: z.string().trim().nullable(),
  nameDe: z.string().trim().min(1, "Name ist Pflicht"),
  nameOriginal: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  originCountry: z.string().trim().length(2).optional(),
  categoryId: z.string().min(1, "Kategorie ist Pflicht"),
  priceRappen: z.number().int().positive("Preis muss positiv sein"),
  vatRate: z.number(),
  unitType: z.enum(["piece", "weight", "volume"]),
  contentAmount: z.number().positive().optional(),
  contentUnit: z.enum(["g", "kg", "ml", "l", "stk"]).optional(),
  storageType: z.enum(["ambient", "chilled", "frozen"]),
  ingredientsDe: z.string().trim().optional(),
  allergens: z.array(z.string()).default([]),
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
}

function hasRequiredCompletionFields(fields: CompletionFields): boolean {
  return Boolean(fields.nameDe && fields.priceRappen > 0 && fields.contentAmount && fields.contentUnit && fields.ingredientsDe);
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
