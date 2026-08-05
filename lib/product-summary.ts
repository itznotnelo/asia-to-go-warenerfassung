import type { ContentUnit, DataSource, Prisma, Product, StorageType, UnitType } from "@/lib/generated/prisma/client";

// Serialisierbare Sicht auf `Product` für die Server-Client-Grenze — Prisma.Decimal
// überlebt die RSC-Serialisierung nicht, deshalb hier zu number konvertiert.
export interface ProductSummary {
  id: string;
  sku: string;
  ean: string | null;
  nameDe: string;
  nameOriginal: string | null;
  brand: string | null;
  originCountry: string | null;
  categoryId: string;
  priceRappen: number;
  vatRate: number;
  unitType: UnitType;
  contentAmount: number | null;
  contentUnit: ContentUnit | null;
  storageType: StorageType;
  ingredientsDe: string | null;
  allergens: string[];
  isAvailable: boolean;
  dataSource: DataSource;
  dataComplete: boolean;
  notes: string | null;
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

export function toProductSummary(product: Product): ProductSummary {
  return {
    id: product.id,
    sku: product.sku,
    ean: product.ean,
    nameDe: product.nameDe,
    nameOriginal: product.nameOriginal,
    brand: product.brand,
    originCountry: product.originCountry,
    categoryId: product.categoryId,
    priceRappen: product.priceRappen,
    vatRate: decimalToNumber(product.vatRate) ?? 2.6,
    unitType: product.unitType,
    contentAmount: decimalToNumber(product.contentAmount),
    contentUnit: product.contentUnit,
    storageType: product.storageType,
    ingredientsDe: product.ingredientsDe,
    allergens: product.allergens,
    isAvailable: product.isAvailable,
    dataSource: product.dataSource,
    dataComplete: product.dataComplete,
    notes: product.notes,
  };
}
