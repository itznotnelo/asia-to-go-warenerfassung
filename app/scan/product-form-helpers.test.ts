import { describe, expect, it } from "vitest";
import { duplicatedFieldsFromLastSaved, mappedOffToFormValues, suggestVatRate } from "./product-form-helpers";
import type { MappedOffProduct } from "@/lib/openfoodfacts/mapping";
import type { CategoryOption, SaveProductInput } from "./actions";

const emptyMapped: MappedOffProduct = { allergens: [], traces: [], imageUrls: {} };

describe("mappedOffToFormValues", () => {
  it("only marks fields OFF actually provided", () => {
    const { initial, sourced } = mappedOffToFormValues({ ...emptyMapped, nameDe: "Nutella", brand: "Ferrero" });
    expect(initial).toEqual({ nameDe: "Nutella", brand: "Ferrero" });
    expect(sourced).toEqual(new Set(["nameDe", "brand"]));
  });

  it("converts contentAmount to a string for the controlled input", () => {
    const { initial, sourced } = mappedOffToFormValues({ ...emptyMapped, contentAmount: 500, contentUnit: "g" });
    expect(initial.contentAmount).toBe("500");
    expect(initial.contentUnit).toBe("g");
    expect(sourced.has("contentAmount")).toBe(true);
  });

  it("marks allergens as sourced only when OFF returned at least one", () => {
    const withAllergens = mappedOffToFormValues({ ...emptyMapped, allergens: ["milk"] });
    expect(withAllergens.sourced.has("allergens")).toBe(true);

    const without = mappedOffToFormValues(emptyMapped);
    expect(without.sourced.has("allergens")).toBe(false);
    expect(without.initial.allergens).toBeUndefined();
  });

  it("produces an empty result for a fully empty mapping", () => {
    const { initial, sourced } = mappedOffToFormValues(emptyMapped);
    expect(initial).toEqual({});
    expect(sourced.size).toBe(0);
  });
});

describe("suggestVatRate", () => {
  const alkohol: CategoryOption = { id: "1", name: "Alkohol", parentName: "Getränke" };
  const kuechenutensilien: CategoryOption = { id: "2", name: "Küchenutensilien", parentName: "Non-Food" };
  const reis: CategoryOption = { id: "3", name: "Reis", parentName: "Nudeln & Reis" };

  it("suggests 8.1% for Alkohol", () => {
    expect(suggestVatRate(alkohol)).toBe(8.1);
  });

  it("suggests 8.1% for anything under Non-Food", () => {
    expect(suggestVatRate(kuechenutensilien)).toBe(8.1);
  });

  it("defaults to 2.6% otherwise", () => {
    expect(suggestVatRate(reis)).toBe(2.6);
  });

  it("defaults to 2.6% when no category is selected yet", () => {
    expect(suggestVatRate(undefined)).toBe(2.6);
  });
});

describe("duplicatedFieldsFromLastSaved", () => {
  const lastSaved: SaveProductInput = {
    ean: "3017620422003",
    nameDe: "Sojasauce",
    nameOriginal: "生抽",
    brand: "Lee Kum Kee",
    originCountry: "CN",
    categoryId: "cat-1",
    priceRappen: 495,
    vatRate: 2.6,
    unitType: "weight",
    contentAmount: 250,
    contentUnit: "ml",
    storageType: "ambient",
    ingredientsDe: "Wasser, Sojabohnen, Salz",
    allergens: ["soybeans", "gluten"],
    notes: "Testnotiz",
    dataSource: "manual",
  };

  it("carries over brand, category and allergens for a same-brand variant", () => {
    const duplicated = duplicatedFieldsFromLastSaved(lastSaved);
    expect(duplicated.nameDe).toBe("Sojasauce");
    expect(duplicated.brand).toBe("Lee Kum Kee");
    expect(duplicated.categoryId).toBe("cat-1");
    expect(duplicated.allergens).toEqual(["soybeans", "gluten"]);
  });

  it("does not carry over price or content amount — those differ between variants", () => {
    const duplicated = duplicatedFieldsFromLastSaved(lastSaved);
    expect(duplicated).not.toHaveProperty("priceChf");
    expect(duplicated).not.toHaveProperty("contentAmount");
  });
});
