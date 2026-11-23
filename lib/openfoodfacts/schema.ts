import { z } from "zod";
import { nutritionSchema } from "@/lib/nutrition";

/**
 * OFF schickt fehlende Werte mal als `null`, mal als leeren String, mal als
 * fehlendes Feld. `null` wird hier einheitlich auf `undefined` normalisiert,
 * bevor das eigentliche Schema greift.
 */
function nullable<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === null ? undefined : value), schema.optional());
}

// "" and "abc" must not become 0 or NaN: only real numbers (or numeric strings) count.
function toNumberOrUndefined(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * One nutriment. A bad or out-of-range value only drops that field (.catch),
 * it never fails the whole lookup, which the UI would show as "OFF nicht erreichbar".
 */
function nutriment(schema: z.ZodType<number | undefined>) {
  return z.preprocess(toNumberOrUndefined, schema).catch(undefined);
}

const nutrimentsSchema = z.object({
  "energy-kcal_100g": nutriment(nutritionSchema.shape.energyKcal100g),
  fat_100g: nutriment(nutritionSchema.shape.fat100g),
  "saturated-fat_100g": nutriment(nutritionSchema.shape.saturatedFat100g),
  carbohydrates_100g: nutriment(nutritionSchema.shape.carbohydrates100g),
  sugars_100g: nutriment(nutritionSchema.shape.sugars100g),
  fiber_100g: nutriment(nutritionSchema.shape.fiber100g),
  proteins_100g: nutriment(nutritionSchema.shape.proteins100g),
  salt_100g: nutriment(nutritionSchema.shape.salt100g),
});

// The server downloads these URLs, so only https on openfoodfacts.org hosts; anything else is dropped.
const offImageUrlSchema = z
  .preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z.url({ protocol: /^https$/, hostname: /^([a-z0-9-]+\.)*openfoodfacts\.org$/ }).optional(),
  )
  .catch(undefined);

export const offProductSchema = z.object({
  code: z.string(),
  product_name: nullable(z.string()),
  product_name_de: nullable(z.string()),
  brands: nullable(z.string()),
  quantity: nullable(z.string()),
  countries_tags: nullable(z.array(z.string())),
  image_front_url: offImageUrlSchema,
  image_ingredients_url: offImageUrlSchema,
  image_nutrition_url: offImageUrlSchema,
  ingredients_text_de: nullable(z.string()),
  allergens_tags: nullable(z.array(z.string())),
  traces_tags: nullable(z.array(z.string())),
  nutriments: nullable(nutrimentsSchema).catch(undefined),
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
