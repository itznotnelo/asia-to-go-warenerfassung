import { z } from "zod";

// All values per 100 g/ml. Grams can't exceed 100; pure fat is ~900 kcal, so 1000 leaves room for rounding.
const grams = z.number().min(0).max(100);
const kcal = z.number().min(0).max(1000);

/**
 * Shape of Product.nutrition (Json). Shared by the OFF mapping and the save
 * schemas so the column has one defined format for the webshop.
 */
export const nutritionSchema = z.strictObject({
  energyKcal100g: kcal.optional(),
  fat100g: grams.optional(),
  saturatedFat100g: grams.optional(),
  carbohydrates100g: grams.optional(),
  sugars100g: grams.optional(),
  fiber100g: grams.optional(),
  proteins100g: grams.optional(),
  salt100g: grams.optional(),
});

export type Nutrition = z.infer<typeof nutritionSchema>;
