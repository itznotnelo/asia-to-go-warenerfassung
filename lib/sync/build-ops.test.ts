import { describe, expect, it } from "vitest";
import { buildCategoryOp, buildProductOp, imagesReadyForSync, isEligibleForShop } from "./build-ops";
import type { ImageForSync, ProductForSync } from "./build-ops";

function makeProduct(overrides: Partial<ProductForSync> = {}): ProductForSync {
  return {
    id: "prod_1",
    ean: "7610200000017",
    sku: "ASIA-00001",
    nameDe: "Jasminreis 5kg",
    nameOriginal: null,
    nameEn: null,
    brand: null,
    originCountry: "TH",
    categoryId: "cat_1",
    priceRappen: 1290,
    vatRate: 2.6,
    unitType: "weight",
    contentAmount: 5,
    contentUnit: "kg",
    storageType: "ambient",
    ingredientsDe: "Reis",
    allergens: [],
    nutrition: null,
    isAvailable: true,
    stockQty: 10,
    dataComplete: true,
    notes: null,
    updatedAt: new Date("2026-10-06T00:00:00.000Z"),
    ...overrides,
  };
}

describe("isEligibleForShop", () => {
  it("requires both dataComplete and isAvailable", () => {
    expect(isEligibleForShop({ dataComplete: true, isAvailable: true })).toBe(true);
    expect(isEligibleForShop({ dataComplete: true, isAvailable: false })).toBe(false);
    expect(isEligibleForShop({ dataComplete: false, isAvailable: true })).toBe(false);
    expect(isEligibleForShop({ dataComplete: false, isAvailable: false })).toBe(false);
  });
});

describe("imagesReadyForSync", () => {
  it("drops images with no r2Key yet", () => {
    const images: ImageForSync[] = [
      { id: "img_1", type: "front", r2Key: "products/prod_1/front-1.jpg", width: 100, height: 100, sortOrder: 0, sourceAttribution: null },
      { id: "img_2", type: "ingredients", r2Key: null, width: 100, height: 100, sortOrder: 1, sourceAttribution: null },
    ];
    const ready = imagesReadyForSync(images);
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("img_1");
  });
});

describe("buildCategoryOp", () => {
  it("builds an upsertCategory op", () => {
    const op = buildCategoryOp({ id: "cat_1", name: "Reis", slug: "reis", sortOrder: 2, parentId: "cat_0" });
    expect(op).toEqual({
      op: "upsertCategory",
      category: { id: "cat_1", name: "Reis", slug: "reis", sortOrder: 2, parentId: "cat_0" },
    });
  });
});

describe("buildProductOp", () => {
  it("builds an upsert op for an eligible product, including only ready images", () => {
    const product = makeProduct();
    const images: ImageForSync[] = [
      { id: "img_1", type: "front", r2Key: "products/prod_1/front-1.jpg", width: 100, height: 100, sortOrder: 0, sourceAttribution: null },
      { id: "img_2", type: "nutrition", r2Key: null, width: 50, height: 50, sortOrder: 1, sourceAttribution: null },
    ];

    const op = buildProductOp(product, images);

    expect(op.op).toBe("upsert");
    if (op.op !== "upsert") throw new Error("expected upsert");
    expect(op.product.id).toBe("prod_1");
    expect(op.product.updatedAt).toBe("2026-10-06T00:00:00.000Z");
    expect(op.product.images).toEqual([
      { id: "img_1", type: "front", r2Key: "products/prod_1/front-1.jpg", width: 100, height: 100, sortOrder: 0, sourceAttribution: null },
    ]);
  });

  it("builds a delete op when the product is incomplete", () => {
    const product = makeProduct({ dataComplete: false });
    const op = buildProductOp(product, []);
    expect(op).toEqual({ op: "delete", id: "prod_1" });
  });

  it("builds a delete op when the product is marked unavailable", () => {
    const product = makeProduct({ isAvailable: false });
    const op = buildProductOp(product, []);
    expect(op).toEqual({ op: "delete", id: "prod_1" });
  });

  it("defaults a null nutrition field to null, not undefined, in the payload", () => {
    const product = makeProduct({ nutrition: null });
    const op = buildProductOp(product, []);
    if (op.op !== "upsert") throw new Error("expected upsert");
    expect(op.product.nutrition).toBeNull();
  });
});
