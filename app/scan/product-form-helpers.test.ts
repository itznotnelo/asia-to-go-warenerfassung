import { describe, expect, it } from "vitest";
import {
  buildQuickCaptureInput,
  duplicatedFieldsFromLastSaved,
  mappedOffToFormValues,
  parseFormNumbers,
  productSummaryToFormValues,
  suggestVatRate,
} from "./product-form-helpers";
import { CONTENT_AMOUNT_ERROR, PRICE_ERROR } from "@/lib/pricing";
import type { MappedOffProduct } from "@/lib/openfoodfacts/mapping";
import type { ProductSummary } from "@/lib/product-summary";
import type { CategoryOption } from "@/lib/category-option";
import type { ProductInput as SaveProductInput } from "@/lib/product-schema";

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

  it("pre-fills OFF allergens and traces as suggestions, never as confirmed (hard rule 5)", () => {
    const { initial, sourced } = mappedOffToFormValues({ ...emptyMapped, allergens: ["gluten"], traces: ["sesame"] });
    expect(initial.allergens).toEqual(["gluten"]);
    expect(initial.traces).toEqual(["sesame"]);
    expect(sourced.has("traces")).toBe(true);
    expect(initial).not.toHaveProperty("allergensConfirmed");
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
    traces: ["sesame"],
    allergensConfirmed: true,
    notes: "Testnotiz",
    dataSource: "manual",
  };

  it("copies the allergen lists but never the confirmation", () => {
    const duplicated = duplicatedFieldsFromLastSaved(lastSaved);
    expect(duplicated.traces).toEqual(["sesame"]);
    expect(duplicated.allergensConfirmed).toBe(false);
  });

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

describe("productSummaryToFormValues", () => {
  const product: ProductSummary = {
    id: "p1",
    sku: "ASIA-00001",
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
    allergens: ["soybeans"],
    traces: [],
    allergensConfirmed: true,
    isAvailable: true,
    dataSource: "manual",
    dataComplete: false,
    notes: null,
  };

  it("shows a stored confirmation as ticked, and a missing one as unticked", () => {
    expect(productSummaryToFormValues(product).allergensConfirmed).toBe(true);
    expect(productSummaryToFormValues({ ...product, allergensConfirmed: false }).allergensConfirmed).toBe(false);
  });

  it("formats the price back into a CHF string for the controlled input", () => {
    expect(productSummaryToFormValues(product).priceChf).toBe("4.95");
  });

  it("converts null fields to empty strings for controlled inputs", () => {
    const values = productSummaryToFormValues({ ...product, nameOriginal: null, notes: null, contentAmount: null, contentUnit: null });
    expect(values.nameOriginal).toBe("");
    expect(values.notes).toBe("");
    expect(values.contentAmount).toBe("");
    expect(values.contentUnit).toBe("");
  });

  it("round-trips the editable fields", () => {
    const values = productSummaryToFormValues(product);
    expect(values.nameDe).toBe("Sojasauce");
    expect(values.brand).toBe("Lee Kum Kee");
    expect(values.allergens).toEqual(["soybeans"]);
  });
});

describe("buildQuickCaptureInput", () => {
  const reis: CategoryOption = { id: "cat-reis", name: "Reis", parentName: "Nudeln & Reis" };
  const alkohol: CategoryOption = { id: "cat-alk", name: "Alkohol", parentName: "Getränke" };

  it("fills only the schema-required fields, defaulting unitType/storageType", () => {
    const input = buildQuickCaptureInput({
      ean: "3017620422003",
      nameDe: "Testartikel",
      categoryId: "cat-reis",
      priceRappen: 500,
      category: reis,
      dataSource: "manual",
    });
    expect(input.unitType).toBe("piece");
    expect(input.storageType).toBe("ambient");
    expect(input.contentAmount).toBeUndefined();
    expect(input.contentUnit).toBeUndefined();
    expect(input.ingredientsDe).toBeUndefined();
    expect(input.allergens).toEqual([]);
    expect(input.allergensConfirmed).toBe(false);
  });

  it("still auto-suggests the correct VAT rate from the category", () => {
    const input = buildQuickCaptureInput({
      ean: null,
      nameDe: "Bier",
      categoryId: "cat-alk",
      priceRappen: 1000,
      category: alkohol,
      dataSource: "manual",
    });
    expect(input.vatRate).toBe(8.1);
  });

  it("defaults to 2.6% when the category lookup is unavailable", () => {
    const input = buildQuickCaptureInput({
      ean: null,
      nameDe: "X",
      categoryId: "cat-reis",
      priceRappen: 100,
      category: undefined,
      dataSource: "manual",
    });
    expect(input.vatRate).toBe(2.6);
  });
});

describe("parseFormNumbers", () => {
  it("parses Swiss thousands separators instead of truncating them", () => {
    expect(parseFormNumbers({ priceChf: "1'250.00", contentAmount: "1'000" })).toEqual({
      ok: true,
      priceRappen: 125000,
      contentAmount: 1000,
    });
  });

  it("leaves an empty content amount undefined", () => {
    expect(parseFormNumbers({ priceChf: "4.50", contentAmount: "  " })).toEqual({
      ok: true,
      priceRappen: 450,
      contentAmount: undefined,
    });
  });

  it("reports both fields when both are unreadable", () => {
    expect(parseFormNumbers({ priceChf: "3 50", contentAmount: "abc" })).toEqual({
      ok: false,
      errors: { priceChf: PRICE_ERROR, contentAmount: CONTENT_AMOUNT_ERROR },
    });
  });

  it("rejects a zero price and a zero content amount", () => {
    expect(parseFormNumbers({ priceChf: "0", contentAmount: "0" })).toEqual({
      ok: false,
      errors: { priceChf: PRICE_ERROR, contentAmount: CONTENT_AMOUNT_ERROR },
    });
  });
});
