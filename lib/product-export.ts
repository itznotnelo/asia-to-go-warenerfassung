import type { Category, Product } from "@/lib/generated/prisma/client";

// Flacher, backup-tauglicher Schnitt durch Product — jedes Schemafeld drin,
// auch die in der UI noch ungenutzten (nameEn), da ein Backup
// verlustfrei sein soll.
export interface ProductExportRow {
  id: string;
  sku: string;
  ean: string;
  nameDe: string;
  nameOriginal: string;
  nameEn: string;
  brand: string;
  originCountry: string;
  category: string;
  priceRappen: number;
  vatRate: number;
  unitType: string;
  contentAmount: number | "";
  contentUnit: string;
  storageType: string;
  ingredientsDe: string;
  allergens: string;
  traces: string;
  allergensConfirmedAt: string;
  isAvailable: boolean;
  stockQty: number | "";
  minStock: number | "";
  reorderQty: number | "";
  packSize: number;
  purchasePriceRappen: number | "";
  defaultSupplierId: string;
  dataSource: string;
  dataComplete: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function toExportRow(product: Product & { category: Category }): ProductExportRow {
  return {
    id: product.id,
    sku: product.sku,
    ean: product.ean ?? "",
    nameDe: product.nameDe,
    nameOriginal: product.nameOriginal ?? "",
    nameEn: product.nameEn ?? "",
    brand: product.brand ?? "",
    originCountry: product.originCountry ?? "",
    category: product.category.name,
    priceRappen: product.priceRappen,
    vatRate: product.vatRate.toNumber(),
    unitType: product.unitType,
    contentAmount: product.contentAmount ? product.contentAmount.toNumber() : "",
    contentUnit: product.contentUnit ?? "",
    storageType: product.storageType,
    ingredientsDe: product.ingredientsDe ?? "",
    allergens: product.allergens.join(";"),
    traces: product.traces.join(";"),
    allergensConfirmedAt: product.allergensConfirmedAt?.toISOString() ?? "",
    isAvailable: product.isAvailable,
    stockQty: product.stockQty ?? "",
    minStock: product.minStock ?? "",
    reorderQty: product.reorderQty ?? "",
    packSize: product.packSize,
    purchasePriceRappen: product.purchasePriceRappen ?? "",
    defaultSupplierId: product.defaultSupplierId ?? "",
    dataSource: product.dataSource,
    dataComplete: product.dataComplete,
    notes: product.notes ?? "",
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
