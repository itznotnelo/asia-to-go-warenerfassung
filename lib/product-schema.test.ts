import { describe, expect, it } from "vitest";
import {
  allergensConfirmedAtFor,
  computeDataComplete,
  isProductComplete,
  MAX_PRICE_RAPPEN,
  productInputSchema,
  updateProductSchema,
  type ProductInput,
} from "./product-schema";

const complete: ProductInput = {
  ean: "3017620422003",
  nameDe: "Sojasauce",
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
  dataSource: "manual",
};

describe("productInputSchema vatRate", () => {
  it.each([2.6, 8.1])("accepts %d", (vatRate) => {
    expect(productInputSchema.safeParse({ ...complete, vatRate }).success).toBe(true);
  });

  it.each([7.7, 2.5, 0, 100, 26])("rejects %d", (vatRate) => {
    const parsed = productInputSchema.safeParse({ ...complete, vatRate });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("MwSt muss 2.6 % oder 8.1 % sein");
  });
});

describe("productInputSchema ean", () => {
  it("stores a UPC-A as its EAN-13 form", () => {
    expect(productInputSchema.parse({ ...complete, ean: " 036000291452 " }).ean).toBe("0036000291452");
  });

  it("turns an empty field into null", () => {
    expect(productInputSchema.parse({ ...complete, ean: "" }).ean).toBeNull();
    expect(productInputSchema.parse({ ...complete, ean: null }).ean).toBeNull();
  });

  it.each(["3017620422004", "12345", "30176204a2003"])("rejects %s with a German message", (ean) => {
    const parsed = productInputSchema.safeParse({ ...complete, ean });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Ungültiger Barcode (Prüfziffer falsch)");
  });
});

describe("productInputSchema priceRappen", () => {
  it("accepts the CHF 10'000 cap itself", () => {
    expect(productInputSchema.safeParse({ ...complete, priceRappen: MAX_PRICE_RAPPEN }).success).toBe(true);
  });

  it.each([MAX_PRICE_RAPPEN + 1, 1_234_567_000])("rejects %d with a German message", (priceRappen) => {
    const parsed = productInputSchema.safeParse({ ...complete, priceRappen });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Preis ist zu hoch (höchstens CHF 10'000)");
  });
});

describe("computeDataComplete", () => {
  it("is complete only when every Pflichtfeld and an image are present", () => {
    expect(computeDataComplete(complete, true)).toBe(true);
  });

  it("is never complete without at least one image, even with all other fields set", () => {
    expect(computeDataComplete(complete, false)).toBe(false);
  });

  it("is incomplete without contentAmount/contentUnit even for piece-type items", () => {
    const pieceItem: ProductInput = { ...complete, unitType: "piece", contentAmount: undefined, contentUnit: undefined };
    expect(computeDataComplete(pieceItem, true)).toBe(false);
  });

  it("is incomplete without ingredientsDe", () => {
    expect(computeDataComplete({ ...complete, ingredientsDe: undefined }, true)).toBe(false);
  });

  it("is incomplete with a zero or negative price", () => {
    expect(computeDataComplete({ ...complete, priceRappen: 0 }, true)).toBe(false);
  });

  it("is incomplete while the allergens are not confirmed (hard rule 5)", () => {
    expect(computeDataComplete({ ...complete, allergensConfirmed: false }, true)).toBe(false);
  });
});

describe("productInputSchema allergens", () => {
  it("defaults to unconfirmed with empty lists when the client sends nothing", () => {
    const parsed = productInputSchema.parse({ ...complete, allergens: undefined, traces: undefined, allergensConfirmed: undefined });
    expect(parsed.allergens).toEqual([]);
    expect(parsed.traces).toEqual([]);
    expect(parsed.allergensConfirmed).toBe(false);
  });

  it("rejects keys outside the 14 canonical allergens", () => {
    expect(productInputSchema.safeParse({ ...complete, allergens: ["soybeans", "en:soy"] }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...complete, traces: ["peanut"] }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...complete, traces: ["peanuts", "sesame"] }).success).toBe(true);
  });
});

describe("productInputSchema unit rules (#32)", () => {
  function fieldErrorsFor(input: Partial<ProductInput>) {
    const parsed = productInputSchema.safeParse({ ...complete, ...input });
    return parsed.success ? undefined : parsed.error.flatten().fieldErrors;
  }

  it("lets a pack carry any content unit, or none", () => {
    for (const contentUnit of ["g", "kg", "ml", "l", "stk"] as const) {
      expect(fieldErrorsFor({ unitType: "piece", contentAmount: 5, contentUnit })).toBeUndefined();
    }
    expect(fieldErrorsFor({ unitType: "piece", contentAmount: undefined, contentUnit: undefined })).toBeUndefined();
  });

  it("allows loose goods only in matching units", () => {
    expect(fieldErrorsFor({ unitType: "weight", contentAmount: 1, contentUnit: "kg" })).toBeUndefined();
    expect(fieldErrorsFor({ unitType: "weight", contentAmount: 100, contentUnit: "g" })).toBeUndefined();
    expect(fieldErrorsFor({ unitType: "volume", contentAmount: 1, contentUnit: "l" })).toBeUndefined();
    expect(fieldErrorsFor({ unitType: "volume", contentAmount: undefined, contentUnit: "ml" })?.contentAmount).toEqual([
      "Inhaltsmenge fehlt zur Einheit",
    ]);
  });

  it.each([
    ["weight", "ml"],
    ["weight", "stk"],
    ["volume", "g"],
    ["volume", "stk"],
  ] as const)("rejects %s with %s", (unitType, contentUnit) => {
    const errors = fieldErrorsFor({ unitType, contentAmount: 1, contentUnit });
    expect(errors?.contentUnit?.[0]).toMatch(/braucht/);
  });

  it("rejects loose goods without a unit, since no Grundpreis could be shown", () => {
    const errors = fieldErrorsFor({ unitType: "weight", contentAmount: undefined, contentUnit: undefined });
    expect(errors?.contentUnit).toEqual(["Offen nach Gewicht braucht g oder kg"]);
  });

  it("requires amount and unit together", () => {
    expect(fieldErrorsFor({ contentAmount: undefined, contentUnit: "g" })?.contentAmount).toEqual(["Inhaltsmenge fehlt zur Einheit"]);
    expect(fieldErrorsFor({ contentAmount: 250, contentUnit: undefined })?.contentUnit).toEqual(["Einheit fehlt zur Inhaltsmenge"]);
  });

  it("applies the same rules on the edit path", () => {
    expect(updateProductSchema.safeParse({ ...complete, id: "p1" }).success).toBe(true);
    expect(updateProductSchema.safeParse({ ...complete, id: "p1", unitType: "volume", contentUnit: "g" }).success).toBe(false);
    expect(updateProductSchema.safeParse({ ...complete, id: "" }).success).toBe(false);
  });
});

describe("productInputSchema nutrition (#30)", () => {
  it("is optional and passes OFF values through unchanged", () => {
    expect(productInputSchema.parse(complete).nutrition).toBeUndefined();
    const nutrition = { energyKcal100g: 539, fat100g: 30.9, salt100g: 0.107 };
    expect(productInputSchema.parse({ ...complete, nutrition }).nutrition).toEqual(nutrition);
  });

  it("rejects unknown keys, strings and impossible values", () => {
    expect(productInputSchema.safeParse({ ...complete, nutrition: { kcal: 100 } }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...complete, nutrition: { fat100g: "30" } }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...complete, nutrition: { fat100g: 130 } }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...complete, nutrition: { sugars100g: -1 } }).success).toBe(false);
  });
});

describe("allergensConfirmedAtFor", () => {
  const now = new Date("2026-10-30T09:00:00.000Z");
  const earlier = new Date("2026-10-01T08:00:00.000Z");
  const existing = { allergensConfirmedAt: earlier, allergens: ["soybeans", "gluten"], traces: ["sesame"] };

  it("is null whenever the box is not ticked, even if it was confirmed before", () => {
    expect(allergensConfirmedAtFor({ allergensConfirmed: false, allergens: [], traces: [] }, null, now)).toBeNull();
    expect(allergensConfirmedAtFor({ ...existing, allergensConfirmed: false }, existing, now)).toBeNull();
  });

  it("stamps now on a first confirmation", () => {
    expect(allergensConfirmedAtFor({ allergensConfirmed: true, allergens: ["milk"], traces: [] }, null, now)).toBe(now);
    const unconfirmed = { ...existing, allergensConfirmedAt: null };
    expect(allergensConfirmedAtFor({ ...existing, allergensConfirmed: true }, unconfirmed, now)).toBe(now);
  });

  it("keeps the earlier timestamp when the lists are unchanged (order does not matter)", () => {
    const input = { allergensConfirmed: true, allergens: ["gluten", "soybeans"], traces: ["sesame"] };
    expect(allergensConfirmedAtFor(input, existing, now)).toBe(earlier);
  });

  it("re-stamps when allergens or traces changed", () => {
    expect(allergensConfirmedAtFor({ allergensConfirmed: true, allergens: ["gluten"], traces: ["sesame"] }, existing, now)).toBe(now);
    expect(allergensConfirmedAtFor({ allergensConfirmed: true, allergens: ["soybeans", "gluten"], traces: [] }, existing, now)).toBe(now);
  });
});

describe("isProductComplete", () => {
  const savedProduct = {
    nameDe: "Sojasauce",
    priceRappen: 495,
    contentAmount: 250,
    contentUnit: "ml",
    ingredientsDe: "Wasser, Sojabohnen, Salz",
    allergensConfirmed: true,
  };

  it("needs the allergen confirmation on a saved product too", () => {
    expect(isProductComplete({ ...savedProduct, allergensConfirmed: false }, true)).toBe(false);
  });

  it("applies the same rule as computeDataComplete, but to a saved product shape", () => {
    expect(isProductComplete(savedProduct, true)).toBe(true);
    expect(isProductComplete(savedProduct, false)).toBe(false);
  });

  it("treats null fields (as stored in the DB) the same as undefined", () => {
    expect(isProductComplete({ ...savedProduct, ingredientsDe: null }, true)).toBe(false);
    expect(isProductComplete({ ...savedProduct, contentAmount: null, contentUnit: null }, true)).toBe(false);
  });
});
