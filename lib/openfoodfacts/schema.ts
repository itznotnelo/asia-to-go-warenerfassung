import { z } from "zod";

/**
 * OFF schickt fehlende Werte mal als `null`, mal als leeren String, mal als
 * fehlendes Feld. `null` wird hier einheitlich auf `undefined` normalisiert,
 * bevor das eigentliche Schema greift — sonst scheitert z.B. `z.coerce.number()`
 * an `null` (würde sonst stillschweigend zu 0).
 */
function nullable<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === null ? undefined : value), schema.optional());
}

const nutrimentsSchema = z.object({
  "energy-kcal_100g": nullable(z.coerce.number()),
  fat_100g: nullable(z.coerce.number()),
  "saturated-fat_100g": nullable(z.coerce.number()),
  carbohydrates_100g: nullable(z.coerce.number()),
  sugars_100g: nullable(z.coerce.number()),
  fiber_100g: nullable(z.coerce.number()),
  proteins_100g: nullable(z.coerce.number()),
  salt_100g: nullable(z.coerce.number()),
});

export const offProductSchema = z.object({
  code: z.string(),
  product_name: nullable(z.string()),
  product_name_de: nullable(z.string()),
  brands: nullable(z.string()),
  quantity: nullable(z.string()),
  countries_tags: nullable(z.array(z.string())),
  image_front_url: nullable(z.string()),
  image_ingredients_url: nullable(z.string()),
  image_nutrition_url: nullable(z.string()),
  ingredients_text_de: nullable(z.string()),
  allergens_tags: nullable(z.array(z.string())),
  traces_tags: nullable(z.array(z.string())),
  nutriments: nullable(nutrimentsSchema),
});

/**
 * Antwort-Hülle der OFF v2 API. Bei unbekanntem Barcode kommt HTTP 200 mit
 * `status: 0` und **ohne** `product`-Feld — nie auf ein einzelnes Statusfeld
 * verlassen, siehe .claude/skills/openfoodfacts/SKILL.md.
 */
export const offResponseSchema = z.object({
  status: nullable(z.number()),
  status_verbose: nullable(z.string()),
  product: nullable(offProductSchema),
});

export type OffProduct = z.infer<typeof offProductSchema>;
export type OffNutriments = z.infer<typeof nutrimentsSchema>;
export type OffResponse = z.infer<typeof offResponseSchema>;
