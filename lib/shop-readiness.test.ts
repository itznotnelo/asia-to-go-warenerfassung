import { describe, expect, it } from "vitest";
import { computeDataComplete, isProductComplete, type ProductInput } from "@/lib/product-schema";
import { missingForShop, missingLabels, shopState, type ReadinessFields } from "@/lib/shop-readiness";

const food: ReadinessFields = {
  nameDe: "Jasminreis",
  priceRappen: 1390,
  kind: "food",
  unitType: "weight",
  contentAmount: 5,
  contentUnit: "kg",
  ingredientsDe: "Reis",
  allergensConfirmed: true,
};

describe("missingForShop", () => {
  it("is empty for a complete food article with a photo", () => {
    expect(missingForShop(food, true)).toEqual([]);
  });

  it("names the photo when only the photo is missing", () => {
    expect(missingForShop(food, false)).toEqual(["image"]);
  });

  it("lists everything a quick capture still needs, in the order of the edit page", () => {
    const quick: ReadinessFields = { ...food, contentAmount: null, contentUnit: null, ingredientsDe: null, allergensConfirmed: false };
    expect(missingForShop(quick, false)).toEqual(["image", "content", "ingredients", "allergens"]);
    expect(missingLabels(missingForShop(quick, false))).toEqual(["Foto", "Inhalt (Menge und Einheit)", "Zutaten", "Allergene prüfen"]);
  });

  it("never treats unconfirmed allergens as done (hard rule 5)", () => {
    expect(missingForShop({ ...food, allergensConfirmed: false }, true)).toEqual(["allergens"]);
  });

  it("asks alcohol for the same labelling as food", () => {
    expect(missingForShop({ ...food, kind: "alcohol", ingredientsDe: "" }, true)).toEqual(["ingredients"]);
  });

  it("asks non-food sold by the piece for name, price and photo only", () => {
    const bowl: ReadinessFields = { nameDe: "Reisschale", priceRappen: 450, kind: "non_food", unitType: "piece", allergensConfirmed: false };
    expect(missingForShop(bowl, true)).toEqual([]);
    expect(missingForShop(bowl, false)).toEqual(["image"]);
  });

  it("asks non-food sold by weight or volume for the content (Grundpreis)", () => {
    const soap: ReadinessFields = { nameDe: "Seife flüssig", priceRappen: 590, kind: "cosmetics", unitType: "volume", allergensConfirmed: false };
    expect(missingForShop(soap, true)).toEqual(["content"]);
  });

  it("flags a missing name and a zero price", () => {
    expect(missingForShop({ ...food, nameDe: "", priceRappen: 0 }, true)).toEqual(["name", "price"]);
  });
});

describe("dataComplete stays the same rule", () => {
  it("is true exactly when nothing is missing", () => {
    const cases: Array<[ReadinessFields, boolean]> = [
      [food, true],
      [food, false],
      [{ ...food, allergensConfirmed: false }, true],
      [{ ...food, kind: "non_food", unitType: "piece", ingredientsDe: null, allergensConfirmed: false }, true],
      [{ ...food, kind: "cosmetics", unitType: "volume", contentAmount: null }, true],
    ];
    for (const [fields, hasImage] of cases) {
      const expected = missingForShop(fields, hasImage).length === 0;
      expect(isProductComplete(fields, hasImage)).toBe(expected);
      expect(computeDataComplete(fields as ProductInput & { kind: ReadinessFields["kind"] }, hasImage)).toBe(expected);
    }
  });
});

describe("shopState", () => {
  it("is visible only when nothing is missing and the article is available", () => {
    expect(shopState({ missingCount: 0, isAvailable: true })).toBe("visible");
    expect(shopState({ missingCount: 0, isAvailable: false })).toBe("hidden-unavailable");
    expect(shopState({ missingCount: 2, isAvailable: true })).toBe("incomplete");
    expect(shopState({ missingCount: 0, isAvailable: true, archived: true })).toBe("archived");
  });
});
