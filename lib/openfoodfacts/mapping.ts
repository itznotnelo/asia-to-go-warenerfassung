import type { OffProduct } from "./schema";
import { mapAllergenTags } from "./allergens";
import { suggestOriginCountry } from "./countries";
import { parseQuantity } from "./quantity";

// CJK, Hangul, Thai, Kana — Skripte, die in der Schweiz sicher nicht als
// deutscher Produktname durchgehen und stattdessen den Originalnamen liefern.
const NON_LATIN_SCRIPT = /[぀-ヿ㐀-鿿가-힯฀-๿]/;

export interface MappedNutrition {
  energyKcal100g?: number;
  fat100g?: number;
  saturatedFat100g?: number;
  carbohydrates100g?: number;
  sugars100g?: number;
  fiber100g?: number;
  proteins100g?: number;
  salt100g?: number;
}

export interface MappedOffProduct {
  nameDe?: string;
  nameOriginal?: string;
  brand?: string;
  originCountry?: string;
  contentAmount?: number;
  contentUnit?: "g" | "kg" | "ml" | "l" | "stk";
  ingredientsDe?: string;
  allergens: string[];
  traces: string[];
  nutrition?: MappedNutrition;
  imageUrls: {
    front?: string;
    ingredients?: string;
    nutrition?: string;
  };
}

function firstBrand(brands: string | undefined): string | undefined {
  const first = brands?.split(",")[0]?.trim();
  return first || undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function mapNutrition(nutriments: OffProduct["nutriments"]): MappedNutrition | undefined {
  if (!nutriments) return undefined;
  const mapped: MappedNutrition = {
    energyKcal100g: nutriments["energy-kcal_100g"],
    fat100g: nutriments.fat_100g,
    saturatedFat100g: nutriments["saturated-fat_100g"],
    carbohydrates100g: nutriments.carbohydrates_100g,
    sugars100g: nutriments.sugars_100g,
    fiber100g: nutriments.fiber_100g,
    proteins100g: nutriments.proteins_100g,
    salt100g: nutriments.salt_100g,
  };
  const hasAnyValue = Object.values(mapped).some((value) => value !== undefined);
  return hasAnyValue ? mapped : undefined;
}

/**
 * Reine Funktion: OFF-Rohdaten → unser Produktschema. Kein Netzwerk, kein
 * Cache — das übernimmt client.ts. Ergebnis sind nur Vorschläge; nichts hier
 * darf ungeprüft als `dataComplete` durchgehen (v.a. Allergene).
 */
export function mapOffToProduct(product: OffProduct): MappedOffProduct {
  const productName = nonEmpty(product.product_name);
  const isOriginalNonLatin = productName ? NON_LATIN_SCRIPT.test(productName) : false;

  const nameDe = nonEmpty(product.product_name_de) ?? (isOriginalNonLatin ? undefined : productName);
  const nameOriginal = isOriginalNonLatin ? productName : undefined;

  const parsedQuantity = parseQuantity(product.quantity ?? undefined);

  return {
    nameDe,
    nameOriginal,
    brand: firstBrand(product.brands ?? undefined),
    originCountry: suggestOriginCountry(product.countries_tags ?? undefined),
    contentAmount: parsedQuantity?.contentAmount,
    contentUnit: parsedQuantity?.contentUnit,
    ingredientsDe: nonEmpty(product.ingredients_text_de),
    allergens: mapAllergenTags(product.allergens_tags ?? undefined),
    traces: mapAllergenTags(product.traces_tags ?? undefined),
    nutrition: mapNutrition(product.nutriments),
    imageUrls: {
      front: nonEmpty(product.image_front_url),
      ingredients: nonEmpty(product.image_ingredients_url),
      nutrition: nonEmpty(product.image_nutrition_url),
    },
  };
}
