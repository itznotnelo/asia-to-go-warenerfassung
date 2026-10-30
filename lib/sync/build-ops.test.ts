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
    kind: "food",
    unitType: "weight",
    contentAmount: 5,
    contentUnit: "kg",
    storageType: "ambient",
    ingredientsDe: "Reis",
    allergens: [],
    allergensConfirmedAt: new Date("2026-10-05T00:00:00.000Z"),
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
  const confirmed = { kind: "food", allergensConfirmedAt: new Date("2026-10-05T00:00:00.000Z") } as const;

  it("requires both dataComplete and isAvailable", () => {
    expect(isEligibleForShop({ dataComplete: true, isAvailable: true, ...confirmed })).toBe(true);
    expect(isEligibleForShop({ dataComplete: true, isAvailable: false, ...confirmed })).toBe(false);
    expect(isEligibleForShop({ dataComplete: false, isAvailable: true, ...confirmed })).toBe(false);
    expect(isEligibleForShop({ dataComplete: false, isAvailable: false, ...confirmed })).toBe(false);
  });

  it("keeps a complete legacy row with unconfirmed allergens out of the shop", () => {
    expect(isEligibleForShop({ dataComplete: true, isAvailable: true, kind: "food", allergensConfirmedAt: null })).toBe(false);
    expect(isEligibleForShop({ dataComplete: true, isAvailable: true, kind: "alcohol", allergensConfirmedAt: null })).toBe(false);
  });

  it("does not ask non-food or cosmetics for an allergen check (#27)", () => {
    expect(isEligibleForShop({ dataComplete: true, isAvailable: true, kind: "non_food", allergensConfirmedAt: null })).toBe(true);
    expect(isEligibleForShop({ dataComplete: true, isAvailable: true, kind: "cosmetics", allergensConfirmedAt: null })).toBe(true);
    expect(isEligibleForShop({ dataComplete: false, isAvailable: true, kind: "non_food", allergensConfirmedAt: null })).toBe(false);
  });

  it("keeps an archived (gelöschter) product out of the shop, and treats a missing archivedAt as active", () => {
    const ready = { dataComplete: true, isAvailable: true, ...confirmed };
    expect(isEligibleForShop({ ...ready, archivedAt: new Date("2026-10-30T16:00:00.000Z") })).toBe(false);
    expect(isEligibleForShop({ ...ready, archivedAt: null })).toBe(true);
    expect(isEligibleForShop(ready)).toBe(true);
  });
});

describe("buildProductOp archive gate (review should #34)", () => {
  it("turns an otherwise publishable archived product into a delete", () => {
    expect(buildProductOp(makeProduct({ archivedAt: new Date("2026-10-30T16:00:00.000Z") }), [])).toEqual({
      op: "delete",
      id: "prod_1",
    });
  });
});

describe("buildProductOp allergen gate", () => {
  it("deletes a product whose allergens were never confirmed", () => {
    expect(buildProductOp(makeProduct({ allergensConfirmedAt: null }), [])).toEqual({ op: "delete", id: "prod_1" });
  });

  it("publishes a confirmed product", () => {
    expect(buildProductOp(makeProduct(), []).op).toBe("upsert");
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

// Everything that leaves the device for the shop backend (review should #37).
// A new field has to be added here on purpose; internal data never goes.
const PUBLISH_PRODUCT_KEYS = [
  "allergens",
  "brand",
  "categoryId",
  "contentAmount",
  "contentUnit",
  "dataComplete",
  "ean",
  "id",
  "images",
  "ingredientsDe",
  "isAvailable",
  "nameDe",
  "nameEn",
  "nameOriginal",
  "nutrition",
  "originCountry",
  "priceRappen",
  "sku",
  "storageType",
  "unitType",
  "updatedAt",
  "vatRate",
];

const PUBLISH_IMAGE_KEYS = ["height", "id", "r2Key", "sortOrder", "sourceAttribution", "type", "width"];

describe("buildProductOp payload allowlist", () => {
  const note = "Einkauf CHF 1.20 bei Lieferant X, Marge tief";
  const images: ImageForSync[] = [
    { id: "img_1", type: "front", r2Key: "products/prod_1/front-1.jpg", width: 100, height: 100, sortOrder: 0, sourceAttribution: null },
  ];

  function publishedProduct() {
    const op = buildProductOp(makeProduct({ notes: note, stockQty: 42 }), images);
    if (op.op !== "upsert") throw new Error("expected upsert");
    return op.product;
  }

  it("sends exactly the allowlisted product keys", () => {
    expect(Object.keys(publishedProduct()).sort()).toEqual(PUBLISH_PRODUCT_KEYS);
  });

  it("sends exactly the allowlisted image keys", () => {
    for (const image of publishedProduct().images) {
      expect(Object.keys(image).sort()).toEqual(PUBLISH_IMAGE_KEYS);
    }
  });

  it("never puts the internal note or the stock count on the wire", () => {
    const wire = JSON.stringify(buildProductOp(makeProduct({ notes: note, stockQty: 42 }), images));
    expect(wire).not.toContain(note);
    expect(wire).not.toContain('"notes"');
    expect(wire).not.toContain('"stockQty"');
  });
});
