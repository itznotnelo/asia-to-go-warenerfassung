import type { PublishCategoryPayload, PublishOp, PublishProductPayload } from "./types";

export interface CategoryForSync {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  parentId: string | null;
}

export interface ImageForSync {
  id: string;
  type: string;
  r2Key: string | null;
  width: number;
  height: number;
  sortOrder: number;
  sourceAttribution: string | null;
}

export interface ProductForSync {
  id: string;
  ean: string | null;
  sku: string;
  nameDe: string;
  nameOriginal: string | null;
  nameEn: string | null;
  brand: string | null;
  originCountry: string | null;
  categoryId: string;
  priceRappen: number;
  vatRate: number;
  unitType: string;
  contentAmount: number | null;
  contentUnit: string | null;
  storageType: string;
  ingredientsDe: string | null;
  allergens: string[];
  nutrition: unknown;
  isAvailable: boolean;
  stockQty: number | null;
  dataComplete: boolean;
  notes: string | null;
  updatedAt: Date;
}

// Mirrors the backend's own publish rule (atg-shop-backend, src/routes/catalogue.js:
// `WHERE is_available = 1 AND data_complete = 1`) - a product that doesn't meet
// this belongs out of the shop, not in as an incomplete row.
export function isEligibleForShop(product: Pick<ProductForSync, "dataComplete" | "isAvailable">): boolean {
  return product.dataComplete && product.isAvailable;
}

/** Only images already pushed to R2 (r2Key set) can go into a publish payload. */
export function imagesReadyForSync(images: ImageForSync[]): Array<ImageForSync & { r2Key: string }> {
  return images.filter((image): image is ImageForSync & { r2Key: string } => image.r2Key !== null);
}

export function buildCategoryOp(category: CategoryForSync): PublishOp {
  const payload: PublishCategoryPayload = {
    id: category.id,
    name: category.name,
    slug: category.slug,
    sortOrder: category.sortOrder,
    parentId: category.parentId,
  };
  return { op: "upsertCategory", category: payload };
}

/**
 * An ineligible product (incomplete data, or marked unavailable) becomes a
 * `delete` op rather than an `upsert` - the backend's delete is idempotent
 * (atg-shop-backend, src/routes/publish.js) even if the product was never
 * actually published, which is exactly the retry-safety the offline queue
 * (#1369) needs.
 */
export function buildProductOp(product: ProductForSync, images: ImageForSync[]): PublishOp {
  if (!isEligibleForShop(product)) {
    return { op: "delete", id: product.id };
  }

  const payload: PublishProductPayload = {
    id: product.id,
    ean: product.ean,
    sku: product.sku,
    nameDe: product.nameDe,
    nameOriginal: product.nameOriginal,
    nameEn: product.nameEn,
    brand: product.brand,
    originCountry: product.originCountry,
    categoryId: product.categoryId,
    priceRappen: product.priceRappen,
    vatRate: product.vatRate,
    unitType: product.unitType,
    contentAmount: product.contentAmount,
    contentUnit: product.contentUnit,
    storageType: product.storageType,
    ingredientsDe: product.ingredientsDe,
    allergens: product.allergens,
    nutrition: product.nutrition ?? null,
    isAvailable: product.isAvailable,
    stockQty: product.stockQty,
    dataComplete: product.dataComplete,
    notes: product.notes,
    updatedAt: product.updatedAt.toISOString(),
    images: imagesReadyForSync(images).map((image) => ({
      id: image.id,
      type: image.type,
      r2Key: image.r2Key,
      width: image.width,
      height: image.height,
      sortOrder: image.sortOrder,
      sourceAttribution: image.sourceAttribution,
    })),
  };
  return { op: "upsert", product: payload };
}
