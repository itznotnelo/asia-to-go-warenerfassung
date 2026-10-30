import { describe, expect, it } from "vitest";
import { computeDataComplete, isProductComplete, productInputSchema, type ProductInput } from "./product-schema";

const complete: ProductInput = {
  ean: "3017620422003",
  nameDe: "Sojasauce",
  categoryId: "cat-1",
  priceRappen: 495,
  vatRate: 2.6,
  unitType: "weight",
  contentAmount: 250,
  contentUnit: "ml",
  storageType: "ambient",
  ingredientsDe: "Wasser, Sojabohnen, Salz",
  allergens: ["soybeans"],
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
});

describe("isProductComplete", () => {
  const savedProduct = {
    nameDe: "Sojasauce",
    priceRappen: 495,
    contentAmount: 250,
    contentUnit: "ml",
    ingredientsDe: "Wasser, Sojabohnen, Salz",
  };

  it("applies the same rule as computeDataComplete, but to a saved product shape", () => {
    expect(isProductComplete(savedProduct, true)).toBe(true);
    expect(isProductComplete(savedProduct, false)).toBe(false);
  });

  it("treats null fields (as stored in the DB) the same as undefined", () => {
    expect(isProductComplete({ ...savedProduct, ingredientsDe: null }, true)).toBe(false);
    expect(isProductComplete({ ...savedProduct, contentAmount: null, contentUnit: null }, true)).toBe(false);
  });
});
