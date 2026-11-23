import { describe, expect, it } from "vitest";
import {
  buildQuickCaptureInput,
  duplicatedFieldsFromLastSaved,
  EMPTY_VALUES,
  isFormDirty,
  isQuickCaptureDirty,
  mappedOffToFormValues,
  parseFormNumbers,
  productSummaryToFormValues,
  suggestVatRate,
  VAT_OPTIONS,
  vatAfterCategoryChange,
} from "./product-form-helpers";
import { CONTENT_AMOUNT_ERROR, PRICE_ERROR, VAT_RATES } from "@/lib/pricing";
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

  it("carries OFF nutrition into the form values without marking a field (#30)", () => {
    const nutrition = { energyKcal100g: 539, fat100g: 30.9 };
    const { initial, sourced } = mappedOffToFormValues({ ...emptyMapped, nutrition });
    expect(initial.nutrition).toEqual(nutrition);
    expect(sourced.size).toBe(0);
  });

  it("produces an empty result for a fully empty mapping", () => {
    const { initial, sourced } = mappedOffToFormValues(emptyMapped);
    expect(initial).toEqual({});
    expect(sourced.size).toBe(0);
  });
});

const alkohol: CategoryOption = { id: "1", name: "Alkohol", parentName: "Getränke", slug: "alkohol", parentSlug: "getraenke" };
const kuechenutensilien: CategoryOption = {
  id: "2",
  name: "Küchenutensilien",
  parentName: "Non-Food",
  slug: "kuechenutensilien",
  parentSlug: "non-food",
};
const reis: CategoryOption = { id: "3", name: "Reis", parentName: "Nudeln & Reis", slug: "reis", parentSlug: "nudeln-reis" };

describe("suggestVatRate", () => {
  it("suggests 8.1% for Alkohol", () => {
    expect(suggestVatRate(alkohol)).toBe(8.1);
  });

  it("suggests 8.1% for anything under Non-Food", () => {
    expect(suggestVatRate(kuechenutensilien)).toBe(8.1);
  });

  it("suggests 8.1% for the new Kosmetik and Haushalt categories, 2.6% for Öle & Essig", () => {
    expect(suggestVatRate({ slug: "kosmetik-koerperpflege", parentSlug: "non-food" })).toBe(8.1);
    expect(suggestVatRate({ slug: "haushalt", parentSlug: "non-food" })).toBe(8.1);
    expect(suggestVatRate({ slug: "oele-essig", parentSlug: "saucen-wuerzen" })).toBe(2.6);
  });

  it("keys on the slug, so renaming a category does not change the rate", () => {
    const renamedAlkohol: CategoryOption = { ...alkohol, name: "Bier & Wein" };
    const reisNamedAlkohol: CategoryOption = { ...reis, name: "Alkohol", parentName: "Non-Food" };
    expect(suggestVatRate(renamedAlkohol)).toBe(8.1);
    expect(suggestVatRate(reisNamedAlkohol)).toBe(2.6);
  });

  it("lets a sub-category the tree does not know inherit from its parent", () => {
    expect(suggestVatRate({ slug: "raeucherstaebchen", parentSlug: "non-food" })).toBe(8.1);
    expect(suggestVatRate({ slug: "neu", parentSlug: "nudeln-reis" })).toBe(2.6);
  });

  it("defaults to 2.6% otherwise", () => {
    expect(suggestVatRate(reis)).toBe(2.6);
  });

  it("defaults to 2.6% when no category is selected yet", () => {
    expect(suggestVatRate(undefined)).toBe(2.6);
  });
});

describe("vatAfterCategoryChange", () => {
  it("follows the category while the rate was not picked by hand", () => {
    expect(vatAfterCategoryChange(2.6, false, alkohol)).toEqual({ vatRate: 8.1, suggested: null });
    expect(vatAfterCategoryChange(8.1, false, reis)).toEqual({ vatRate: 2.6, suggested: null });
  });

  it("keeps a hand-picked 8.1% when the category changes, and offers the suggestion as a hint", () => {
    expect(vatAfterCategoryChange(8.1, true, reis)).toEqual({ vatRate: 8.1, suggested: 2.6 });
  });

  it("shows no hint when the hand-picked rate already matches", () => {
    expect(vatAfterCategoryChange(8.1, true, kuechenutensilien)).toEqual({ vatRate: 8.1, suggested: null });
  });
});

describe("VAT_OPTIONS", () => {
  it("offers exactly the two Swiss rates, with a reason in the label", () => {
    expect(VAT_OPTIONS.map((o) => o.rate)).toEqual([...VAT_RATES]);
    expect(VAT_OPTIONS.map((o) => o.label)).toEqual(["2.6 % (Lebensmittel)", "8.1 % (Alkohol, Haushalt, Kosmetik)"]);
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
    unitType: "piece",
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

  it("does not copy nutrition, so the scanned article keeps its own (#30)", () => {
    const duplicated = duplicatedFieldsFromLastSaved({ ...lastSaved, nutrition: { fat100g: 1 } });
    expect(duplicated).not.toHaveProperty("nutrition");
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
    unitType: "piece",
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
  it("fills only the schema-required fields, defaulting unitType/storageType", () => {
    const input = buildQuickCaptureInput({
      ean: "3017620422003",
      nameDe: "Testartikel",
      categoryId: "cat-reis",
      priceRappen: 500,
      vatRate: 2.6,
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

  it("saves the rate shown on screen, even when it differs from the category's suggestion", () => {
    // Mirin filed under a food category but set to 8.1 by hand must stay 8.1.
    const input = buildQuickCaptureInput({
      ean: null,
      nameDe: "Mirin",
      categoryId: "cat-reis",
      priceRappen: 1000,
      vatRate: 8.1,
      dataSource: "manual",
    });
    expect(input.vatRate).toBe(8.1);
  });
});

describe("unsaved input (#29)", () => {
  it("a full form is dirty once any field differs from what it opened with", () => {
    const start = { ...EMPTY_VALUES, nameDe: "Reisnudeln" };
    expect(isFormDirty({ ...start }, start)).toBe(false);
    expect(isFormDirty({ ...start, priceChf: "3.50" }, start)).toBe(true);
    expect(isFormDirty({ ...start, allergens: ["gluten"] }, start)).toBe(true);
    expect(isFormDirty({ ...start, allergensConfirmed: true }, start)).toBe(true);
  });

  it("quick capture: an OFF name alone is not input, anything else is", () => {
    const clean = { nameDe: "Reisnudeln", categoryId: "", priceChf: "", vatTouched: false };
    expect(isQuickCaptureDirty(clean, "Reisnudeln")).toBe(false);
    expect(isQuickCaptureDirty({ ...clean, nameDe: "Glasnudeln" }, "Reisnudeln")).toBe(true);
    expect(isQuickCaptureDirty({ ...clean, categoryId: "c1" }, "Reisnudeln")).toBe(true);
    expect(isQuickCaptureDirty({ ...clean, priceChf: "2" }, "Reisnudeln")).toBe(true);
    expect(isQuickCaptureDirty({ ...clean, vatTouched: true }, "Reisnudeln")).toBe(true);
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
